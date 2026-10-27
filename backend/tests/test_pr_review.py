import json
import subprocess
from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from scripts import pr_review


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
    pr = {"title": "Fix", "body": None, "files": [{"path": "a.py"}], "closingIssuesReferences": [{"number": 3}]}
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
    monkeypatch.setattr(
        pr_review, "gh", fake_gh({"pr view": json.dumps({"title": "t", "body": "", "files": [], "closingIssuesReferences": []})}, calls)
    )
    monkeypatch.setattr(pr_review.anthropic, "Anthropic", lambda: fake_client("max_tokens"))
    assert pr_review.main(["--pr", "1", "--post-comment"]) == 1
    assert "Review incomplete" in capsys.readouterr().err
    assert not any(args[0] in ("api", "pr") and "comment" in " ".join(args) for args, _ in calls)


def test_dry_run_prints_prompt_without_calling_api(monkeypatch, capsys):
    monkeypatch.setattr(
        pr_review, "gh", fake_gh({"pr view": json.dumps({"title": "t", "body": "", "files": [], "closingIssuesReferences": []})}, [])
    )
    monkeypatch.setattr(pr_review.anthropic, "Anthropic", lambda: pytest.fail("API called"))
    assert pr_review.main(["--pr", "1", "--dry-run"]) == 0
    assert "No linked issue." in capsys.readouterr().out


def test_review_is_printed_saved_and_posted(tmp_path, monkeypatch, capsys):
    calls = []
    monkeypatch.setenv("GH_REPO", "")  # main() sets it; monkeypatch restores it afterwards
    monkeypatch.setattr(
        pr_review, "gh", fake_gh({"pr view": json.dumps({"title": "t", "body": "", "files": [], "closingIssuesReferences": []})}, calls)
    )
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
