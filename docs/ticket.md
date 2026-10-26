# Trac comment on #47218 (closed, wontfix)

Post at: https://core.trac.wordpress.org/ticket/47218

## Why a short comment and not a reopen request

#47218 was closed as `wontfix` in June 2025 by core committers, including the
TinyMCE component maintainer. Their reasons: not a project priority, default
WordPress would not benefit, full back-compat is unlikely, and "this is
squarely in plugin territory". Duplicates are still closed against it.

So this comment:

- does **not** ask to reopen the ticket;
- does **not** use the "Modify Ticket" form: leave the action as
  "leave as closed" and do not change keywords or summary;
- follows the route the maintainers suggested (a plugin), and links to it so
  the ~20 people watching the ticket can test it.

Ask for a reopen only later, once the plugin has passed its exit criteria
(`plan.md` Section 6.10) and has real users and compatibility data. That is the
"surrounding circumstances change" mentioned in comment:45.

## Before posting

1. Create the plugin repo and replace `REPO_URL_HERE`.
2. Have at least a working Phase 1 build in it (v8 boots in the classic
   editor). Posting with an empty repo will not convince anyone.

## Comment

Trac uses WikiFormatting. Copy everything inside the block as is.

```
Following up on comment:42 and comment:48: I've started building this as a plugin that replaces the bundled TinyMCE 4.9.11 with TinyMCE 8.x, along the lines of comment:7.

Repo: REPO_URL_HERE

The approach:

 * Bundle TinyMCE 8.x (GPL, `license_key: 'gpl'`) and replace the `wp-tinymce` scripts through the existing script and editor filters, without core changes.
 * A `compat4x` layer that maps the most common removed v4 APIs (`editor.addButton()`, `editor.addMenuItem()`, `editor.settings`, `tinymce.editors`, `tinymce.$`) to v8 and logs deprecation notices. Custom `tinymce.ui` controls are out of scope and need a real port.
 * Port the WordPress TinyMCE plugins (`wordpress`, `wplink`, `wpeditimage`, `wpview`, `wptextpattern`, etc.) to the v8 APIs, and test the classic editor, Classic block, Text widget, and `wp_editor()`.

I'm not asking to reopen this ticket. I'm working on it part-time and will post occasional progress updates here. If you rely on the classic editor or TinyMCE in a plugin (bbPress, ACF, custom fields, front-end editors), testing and bug reports on the repo would help a lot.
```

## After posting

- Use the repo's issue tracker for bug reports and progress, not Trac.
- Post a short update on #47218 at each milestone (Phase 1 boot, `compat4x`
  alpha, plugin ports done, WordPress.org release).
