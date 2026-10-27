import json
import subprocess
from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from scripts import pr_review

EMPTY_PR = {"title": "t", "body": "", "files": [], "closingIssuesReferences": [], "comments": [], "headRefOid": "sha"}


def fake_gh(responses: dict[str, str], calls: list):
    def gh(*args, stdin=None):
        calls.append((args, stdin))
        for prefix, out in responses.items():
            if " ".join(args).startswith(prefix):
                return out
        return ""

    return gh


def fake_client(stop_reason: str, text: str = "Looks good."):
    @contextmanager
    def stream(**kwargs):
        content = [SimpleNamespace(type="thinking"), SimpleNamespace(type="text", text=text)]
        yield SimpleNamespace(get_final_message=lambda: SimpleNamespace(stop_reason=stop_reason, content=content))

    return SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=stream)))


def test_pr_number_from_event_with_null_body(tmp_path, monkeypatch):
    event = tmp_path / "event.json"
    event.write_text(json.dumps({"pull_request": {"number": 7, "body": None}}))
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event))
    assert pr_review.pr_from_event() == 7


def test_pr_prompt_includes_linked_and_extra_issues(monkeypatch):
    pr = {**EMPTY_PR, "title": "Fix", "body": None, "files": [{"path": "a.py"}], "closingIssuesReferences": [{"number": 3}]}
    responses = {
        "pr view": json.dumps(pr),
        "pr diff": "+new line",
        "issue view 3": json.dumps({"title": "Linked", "body": "do it"}),
        "issue view 9": json.dumps({"title": "Extra", "body": None}),
    }
    monkeypatch.setattr(pr_review, "gh", fake_gh(responses, []))
    prompt = pr_review.pr_prompt(1, extra_issue=9)
    assert 'title="Linked"' in prompt and 'title="Extra"' in prompt
    assert "(no description)" in prompt and "+new line" in prompt and "a.py" in prompt


def test_api_failure_exits_nonzero_without_posting(monkeypatch, capsys):
    calls = []
    monkeypatch.setattr(pr_review, "gh", fake_gh({"pr view": json.dumps(EMPTY_PR)}, calls))
    monkeypatch.setattr(pr_review.anthropic, "Anthropic", lambda: fake_client("max_tokens"))
    assert pr_review.main(["--pr", "1", "--post-comment"]) == 1
    assert "Review incomplete" in capsys.readouterr().err
    assert not any(args[:2] == ("pr", "comment") or "PATCH" in args for args, _ in calls)


def test_dry_run_prints_prompt_without_calling_api(monkeypatch, capsys):
    monkeypatch.setattr(pr_review, "gh", fake_gh({"pr view": json.dumps(EMPTY_PR)}, []))
    monkeypatch.setattr(pr_review.anthropic, "Anthropic", lambda: pytest.fail("API called"))
    assert pr_review.main(["--pr", "1", "--dry-run"]) == 0
    assert "No linked issue." in capsys.readouterr().out


def test_review_is_printed_saved_and_posted(tmp_path, monkeypatch, capsys):
    calls = []
    monkeypatch.setenv("GH_REPO", "")  # main() sets it; monkeypatch restores it afterwards
    monkeypatch.setattr(pr_review, "gh", fake_gh({"pr view": json.dumps(EMPTY_PR)}, calls))
    monkeypatch.setattr(pr_review.anthropic, "Anthropic", lambda: fake_client("end_turn"))
    out = tmp_path / "review.md"
    assert pr_review.main(["--pr", "1", "--repo", "o/r", "--output", str(out), "--post-comment"]) == 0
    assert out.read_text() == "Looks good."
    assert calls[-1] == (("pr", "comment", "1", "--body-file", "-"), f"{pr_review.MARKER}\nLooks good.")


def test_oversized_input_is_refused(monkeypatch):
    monkeypatch.setattr(pr_review, "MAX_INPUT_CHARS", 10)
    monkeypatch.setattr(pr_review.anthropic, "Anthropic", lambda: pytest.fail("API called"))
    with pytest.raises(pr_review.ReviewError, match="over the 10 limit"):
        pr_review.ask_claude("x" * 11)


def test_existing_review_comment_is_updated(monkeypatch):
    calls = []
    monkeypatch.setattr(pr_review, "gh", fake_gh({"api repos/{owner}/{repo}/issues/5/comments": "11\n22"}, calls))
    pr_review.post_comment(5, "new")
    assert calls[-1][0][:4] == ("api", "-X", "PATCH", "repos/{owner}/{repo}/issues/comments/22")
    assert calls[-1][1] == f"{pr_review.MARKER}\nnew"


def test_gh_failure_raises():
    with pytest.raises(pr_review.ReviewError, match="failed"):
        pr_review.gh("definitely-not-a-gh-command")


def test_code_mode_skips_ignored_and_binary_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    subprocess.run(["git", "init", "-q"], check=True)
    (tmp_path / ".gitignore").write_text(".env\n")
    (tmp_path / ".env").write_text("SECRET=1")
    (tmp_path / "a.py").write_text("print(1)")
    (tmp_path / "data.db").write_bytes(b"\xff\x00\xfe")
    subprocess.run(["git", "add", "."], check=True)
    prompt = pr_review.code_prompt(".")
    assert '<file path="a.py">' in prompt
    assert "SECRET" not in prompt and "data.db" not in prompt


def test_code_mode_with_no_files_fails(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    subprocess.run(["git", "init", "-q"], check=True)
    assert pr_review.main(["--mode", "code", "--path", "."]) == 1
    assert "No tracked text files" in capsys.readouterr().err


def test_pr_prompt_adds_guide_conversation_and_full_files(monkeypatch):
    pr = {
        **EMPTY_PR,
        "files": [{"path": "a.py"}, {"path": "big.lock"}, {"path": "gone.py", "changeType": "DELETED"}, {"path": "img.png"}],
        "comments": [
            {"author": {"login": "github-actions"}, "body": f"{pr_review.MARKER}\nold review"},
            {"author": {"login": "maintainer"}, "body": "Declined: point 3, IngredientDraft has only API fields."},
        ],
    }
    calls = []
    responses = {
        "pr view": json.dumps(pr),
        "pr diff": "+x",
        "api -H Accept: application/vnd.github.raw repos/{owner}/{repo}/contents/AGENTS.md?ref=sha": "Guide text.",
        "api -H Accept: application/vnd.github.raw repos/{owner}/{repo}/contents/a.py?ref=sha": "full a.py",
        "api -H Accept: application/vnd.github.raw repos/{owner}/{repo}/contents/big.lock?ref=sha": "x" * 5000,
    }
    gh = fake_gh(responses, calls)

    def gh_with_binary(*args, stdin=None):
        if args[-1].endswith("img.png?ref=sha"):
            raise UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte")
        return gh(*args, stdin=stdin)

    monkeypatch.setattr(pr_review, "gh", gh_with_binary)
    monkeypatch.setattr(pr_review, "MAX_INPUT_CHARS", 3000)
    prompt = pr_review.pr_prompt(1, extra_issue=None)

    assert prompt.index("<guide>\nGuide text.") < prompt.index("<pr ")
    assert '<comment author="maintainer">' in prompt and "old review" not in prompt
    assert '<file path="a.py">\nfull a.py\n</file>' in prompt
    assert "Full text not included (binary, too large or unavailable; see the diff): big.lock, img.png" in prompt
    assert not any("gone.py" in " ".join(args) for args, _ in calls)


def test_pr_prompt_stays_under_the_limit_when_files_are_omitted(monkeypatch, capsys):
    files = [{"path": f"assets/image_{n:03}.png"} for n in range(60)] + [{"path": "a.py"}]
    pr = {**EMPTY_PR, "files": files}
    calls = []
    gh = fake_gh({"pr view": json.dumps(pr), "pr diff": "+x"}, calls)

    def gh_binary_or_filler(*args, stdin=None):
        if args[0] == "api":
            if args[-1].startswith("repos/{owner}/{repo}/contents/assets/"):
                raise UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte")
            calls.append((args, stdin))
            return "y" * 400
        return gh(*args, stdin=stdin)

    monkeypatch.setattr(pr_review, "gh", gh_binary_or_filler)
    # Sweep the limit across the point where a.py stops fitting beside the 60 omitted paths.
    included = set()
    for limit in range(3300, 6000):  # the fixed parts alone are ~3260 chars
        monkeypatch.setattr(pr_review, "MAX_INPUT_CHARS", limit)
        prompt = pr_review.pr_prompt(1, extra_issue=None)
        assert len(prompt) <= limit
        included.add('<file path="a.py">' in prompt)
    assert included == {True, False}
    assert "can't include assets/image_000.png" in capsys.readouterr().err


def test_pr_prompt_says_when_the_guide_is_unavailable(monkeypatch):
    pr = {**EMPTY_PR, "files": [{"path": "a b#1.py"}]}
    calls = []
    gh = fake_gh({"pr view": json.dumps(pr), "pr diff": "+x"}, calls)

    def gh_no_guide(*args, stdin=None):
        if "AGENTS.md" in args[-1]:
            raise pr_review.ReviewError("gh api failed: HTTP 403 rate limit")
        return gh(*args, stdin=stdin)

    monkeypatch.setattr(pr_review, "gh", gh_no_guide)
    prompt = pr_review.pr_prompt(1, extra_issue=None)

    assert "Project guide (AGENTS.md) unavailable." in prompt
    assert calls[-1][0][-1] == "repos/{owner}/{repo}/contents/a%20b%231.py?ref=sha"


def test_pr_prompt_skips_fetching_files_once_the_budget_is_spent(monkeypatch):
    pr = {**EMPTY_PR, "files": [{"path": "a.py"}]}
    calls = []
    monkeypatch.setattr(pr_review, "gh", fake_gh({"pr view": json.dumps(pr), "pr diff": "+x" * 500}, calls))
    monkeypatch.setattr(pr_review, "MAX_INPUT_CHARS", 500)
    prompt = pr_review.pr_prompt(1, extra_issue=None)

    assert not any("contents/a.py" in args[-1] for args, _ in calls)
    assert prompt.endswith("see the diff): a.py")
