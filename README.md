# GitDisguise

**Safe For Work X** — a Chrome extension that makes Twitter/X look like a GitHub commit history.

Your boss walks by. You're doom-scrolling. Panic sets in. But wait — all they see is a developer deeply reviewing commit diffs on a very active repository. Crisis averted. Promotion pending.

![Demo](https://github.com/user-attachments/assets/55d0ac14-efbf-4cad-889d-c6dab535b77f)

## What is this?

GitDisguise overlays a pixel-perfect GitHub dark-theme UI on top of Twitter/X. Tweets become commits. Threads become PR conversations. Your timeline becomes a commit history. Nobody within a 3-meter radius will suspect a thing.

Twitter's DOM stays alive underneath (invisible, doing its infinite-scroll thing), while our overlay extracts tweet data and renders it as GitHub commits. It's like putting a fake book cover on your novel during a meeting, except the book cover is an entire functioning GitHub page.

## Installation

Since this isn't on the Chrome Web Store (Google might have questions), you'll need to load it manually:

1. Clone this repo or download the ZIP
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right — yes, you're a developer now)
4. Click **Load unpacked**
5. Select the folder containing this extension
6. Navigate to twitter.com or x.com
7. Click the GitDisguise icon in your toolbar and hit **Enable Disguise**
8. Look productive

## Features

### The Feed (Commit History View)

- **Tweets as commits** — each tweet renders as a commit row with a generated hash, identicon avatar, and relative timestamp
- **Date-grouped cards** — commits are grouped by date, just like real GitHub
- **Identicon avatars** — seeded random identicons that flip to reveal the real profile picture after a few seconds (for when you actually need to know who posted)
- **Expand/collapse** — long tweets truncate with a toggle arrow, because commit messages should be concise (we all know they aren't)
- **Copy tweet link** — the copy button grabs the real tweet URL. A toast notification confirms the deed
- **Browse commit** — the `<>` button takes you to the full PR/conversation view
- **Speech bubble icons** — randomly appear next to ~45% of commits to indicate comment activity, because not every commit sparks a conversation
- **CI status badges** — some commits get a green checkmark. They all pass CI here. This is a fantasy, after all
- **Branch dropdown** — switch between `dev` and `prod`, which secretly toggles Twitter's For You / Following tabs
- **Pull-to-refresh** — elastic overscroll animation when you scroll up at the top. It even refreshes the feed
- **Infinite scroll** — delegates scrolling to Twitter's hidden DOM so new tweets keep loading as you scroll

### The PR View (Tweet Detail / Conversation)

When you click a commit's `<>` button or navigate directly to a tweet URL (`/username/status/123`), the extension renders a full GitHub Pull Request page:

- **PR title and number** — generated from the tweet text
- **Draft badge** — because nothing is ever truly ready to merge
- **Merge context line** — with randomly generated buzzword branch names like `feature/quantum-mesh-optimizer` merging into `main`
- **Tabs with counts** — Conversation, Commits, Checks, Files changed (with a colored diff stat bar)
- **OP comment** — the original tweet rendered as the PR description, complete with avatar, timestamp, and media
- **Reply thread** — Twitter replies appear as PR review comments on a timeline with a vertical connector line
- **Collapsible media** — images and videos in both the OP and replies can be expanded/collapsed
- **Sparse emoji reactions** — about 10% of comments get a reaction pill, keeping it realistic
- **Sidebar** — reviewers, assignees, labels, milestone, development links — all generated, all fake, all very convincing

### Settings & Customization

- **Custom org/repo name** — click the repo name in the header to edit it inline, or use the options page. The URL bar updates to match
- **URL disguise** — the address bar shows `github.com/your-org/your-repo/commits/branch` instead of twitter.com. Same-origin restriction means it still says twitter.com in the domain, but the path looks right
- **Repo nav tabs** — Code, Issues, Pull Requests, Actions, etc. — they all link to real GitHub pages using your configured org/repo name
- **Persistent settings** — your org name, repo name, and branch survive browser restarts via `chrome.storage.sync`

### The Little Things

- GitHub dark theme CSS variables throughout — it looks right because it *is* right
- Sticky header and nav bar, just like GitHub
- Monospace commit hashes
- Proper text truncation with ellipsis
- Toast notifications that animate in from the top and gracefully fade out
- A popup with a toggle button and status indicator
- Works on twitter.com, x.com, and mobile.twitter.com

## Architecture

The extension uses what we call the **Overlay Architecture**:

1. Twitter's `#react-root` gets `visibility: hidden` (not `display: none` — we need it alive for data and scroll events)
2. A new `#gh-overlay` div sits at `z-index: 2147483647` (max int, because we're not messing around)
3. Tweet data is extracted from the hidden DOM via polling
4. Everything you see is our own clean DOM, styled with our own CSS

No fighting Twitter's constantly-changing class names. No CSS specificity wars with their stylesheets. We simply pretend they don't exist and build our own reality on top.

## Disclaimer

This extension is for entertainment purposes only. We are not responsible for:

- Promotions received due to perceived productivity
- Awkward moments when your boss asks to see your latest PR and you accidentally show them a tweet thread about cats
- The existential crisis that comes from realizing you'd rather browse Twitter dressed as GitHub than actually use GitHub
- Any reduction in actual commits to real repositories

## License

Do whatever you want with it. If your boss finds out, we don't know you.
