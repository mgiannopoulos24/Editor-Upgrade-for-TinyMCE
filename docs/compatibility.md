# Plugin compatibility

Results for real plugins running on Editor Upgrade for TinyMCE. Testing real plugins is `docs/plan.md` task P7.2, and it has not started, so this list is empty.

The API compatibility tests in `tests/compat/` use fixture plugins written for this project. They show that the API matches TinyMCE 4, not that any particular plugin works.

## Tiers

From `docs/plan.md` Section 11.3.

| Tier | Support | Response |
|---|---|---|
| A | Official testing, with fixes in `compat4x` | 5 business days |
| B | Best-effort testing, with documented workarounds | 10 business days |
| C | `compat4x` graceful degradation only | No commitment |

## Results

| Plugin | Version | Active installs | Tier | Result | Tested on | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

## Result values

- **Works:** every feature that touches the editor works, with no console errors.
- **Works with limits:** the main features work; the notes say what does not.
- **Broken:** a main feature fails; the notes link to the issue.

## Report a result

Open an issue with the plugin name and version, your WordPress and browser versions, what you tried, and any console messages. Turn on `SCRIPT_DEBUG` first, because that shows messages starting with `[Editor Upgrade for TinyMCE]`.
