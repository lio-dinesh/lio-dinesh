# PROMAX GitHub Profile — Setup & Operations

Repository: https://github.com/lio-dinesh/lio-dinesh

## Installed profile analytics

- `README.md` — animated profile, expanded technology catalog, featured projects, Monkeytype, LeetCode, CodeChef and self-hosted GitHub analytics.
- `.github/workflows/profile-cards.yml` — renders GitHub analytics directly into this repository.
- `.github/workflows/main.yml` — existing contribution snake workflow; retained as the only snake publisher.


## Daily automation schedule

All schedules use GitHub Actions' IANA timezone support with `Asia/Kolkata`; the refresh jobs are staggered to avoid concurrent writes.

| Workflow | Daily time (IST) | Data refreshed |
|---|---:|---|
| `Generate GitHub Snake` | 06:35 | Contribution snake SVGs on the `output` branch |
| `Generate self-hosted GitHub profile cards` | 07:00 | Overview, current/longest GitHub streak, 3D contribution calendar, momentum and language cards |
| `Generate 3D practice streak matrix` | 07:50 | Monkeytype streak / typing metrics, LeetCode streak / accepted totals, CodeChef streak / solved / rating / star rank |

These run automatically every day after their workflows exist on the default `main` branch. They also support manual dispatch from the repository's Actions tab.

### Daily rolling activity window

The platform dashboard uses an Asia/Kolkata calendar date and a rolling 91-day (13-week) activity grid. Each run recomputes current streak, longest streak, active days, last activity date and the platform-specific points/metrics from the latest source response. Historical activity is retrieved where the platform exposes it.

### What updates and what has limitations

- **GitHub cards:** rendered and committed as self-hosted light/dark SVG files by `profile-cards.yml`.
- **GitHub snake:** regenerated daily and published to the `output` branch by `main.yml`.
- **Monkeytype:** current/max streak and public profile metrics are read daily. Detailed activity history is private unless public activity is enabled or `MONKEYTYPE_API_KEY` is added as an Actions secret.
- **LeetCode:** the daily GraphQL query refreshes submission calendar, current streak and accepted problem counts. Longest streak is calculated from available active years.
- **CodeChef:** the public heatmap and profile summary are fetched daily to refresh streak estimates, solved count, current/highest rating and star rank. Heatmap streaks may not include official streak-freeze days.
- **External README image cards:** third-party SVG services may have their own caches and refresh policies. The self-hosted practice matrix and GitHub cards are the repository-controlled daily sources.

GitHub may delay scheduled runs during high load. In public repositories, schedules can be disabled after 60 days without repository activity; keep the repository active and check Actions if a daily run is missing. See [GitHub schedule event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).


## GitHub analytics cards

The `profile-cards` workflow uses `seijikohara/profile-cards-action@v1` to render SVGs and commit them to `assets/profile-cards/`.

Generated cards:

- `overview.light.svg` / `overview.dark.svg` — profile statistics.
- `contributions.light.svg` / `contributions.dark.svg` — current streak, longest streak and 3D contribution calendar.
- `momentum.light.svg` / `momentum.dark.svg` — contribution trend over time.
- `languages.light.svg` / `languages.dark.svg` — programming-language treemap.

No personal access token is required for this cards action; the workflow uses the repository's `GITHUB_TOKEN` and `contents: write` permission.

To generate the first set of cards immediately:

1. Open https://github.com/lio-dinesh/lio-dinesh/actions
2. Select **Generate self-hosted GitHub profile cards**.
3. Click **Run workflow** and select `main`.
4. Wait for the run to finish with a green check mark.
5. Confirm that `assets/profile-cards/` contains the eight SVG files listed above.
6. Refresh https://github.com/lio-dinesh.

The workflow also runs daily. Its rendered SVGs are stored in your repository, so the README no longer depends on the public `github-readme-stats.vercel.app` or `github-readme-activity-graph.vercel.app` image endpoints.


## 3D Daily Practice Streak Matrix

- `scripts/generate-practice-streaks.mjs` fetches public streak/activity data for Monkeytype, LeetCode and CodeChef, then renders `assets/practice-streaks.svg`.
- `.github/workflows/practice-streaks.yml` regenerates the SVG daily at 07:50 Asia/Kolkata and can also be run manually from Actions.
- The dashboard displays current streak, longest streak, and a 13-week isometric activity calendar for each platform.

### Data sources and definitions

- **Monkeytype:** current and maximum streak come from the public Monkeytype profile API. The public profile may hide the daily activity calendar. To show that grid too, create an ApeKey in Monkeytype and add it as a repository secret named `MONKEYTYPE_API_KEY`. The key is never stored in the repository.
- **LeetCode:** current streak comes from the public `userCalendar` GraphQL field. Longest streak is calculated from the activity dates returned for the account's active years.
- **CodeChef:** current and longest streak are calculated from the public daily submission heatmap. CodeChef streak-freeze days may not be represented in that heatmap, so the dashboard labels these values as heatmap-derived rather than official freeze-aware totals.

### Generate it

1. Open https://github.com/lio-dinesh/lio-dinesh/actions.
2. Select **Generate 3D practice streak matrix**.
3. Click **Run workflow** on the `main` branch.
4. After a successful run, confirm `assets/practice-streaks.svg` exists.
5. Refresh https://github.com/lio-dinesh.

### Optional Monkeytype activity calendar

1. In Monkeytype, open your account settings and create an ApeKey with the minimum access needed for profile/test-activity reading.
2. In this GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**.
3. Set the secret name to `MONKEYTYPE_API_KEY` and paste the ApeKey as its value.
4. Re-run **Generate 3D practice streak matrix**.
5. Never place the ApeKey in README, workflow YAML, or a public file.


## Monkeytype

- Profile: https://monkeytype.com/profile/lio_dinesh
- README card: `https://monkeytypecard.vercel.app/monkeytype.svg?username=lio_dinesh&theme=serika_dark&timeValue=60&wordValue=50`.
- It is rendered by the public Monkeytype Card SVG service. No GitHub Action or API key is needed for this card.
- If the card is unavailable, use the direct Monkeytype profile link; the external card service can be temporarily unavailable.

## LeetCode

- Profile: https://leetcode.com/u/410725148010/
- The README uses a LeetCode stats SVG card and keeps a direct profile link as a fallback.
- External stats are not guaranteed; the direct LeetCode profile is the authoritative source.

## CodeChef

- Profile: https://www.codechef.com/users/dce_25148010
- The README embeds a public CodeChef statistics SVG from an independent service; it may be rate-limited or unavailable.
- Certificate dashboard: https://www.codechef.com/certificates
- Certificate verification: https://www.codechef.com/certificates/verify
- For a specific verified credential, add the individual shareable certificate URL from the CodeChef dashboard.

## Contribution snake

The existing `.github/workflows/main.yml` publishes `github-snake.svg` and `github-snake-dark.svg` to the `output` branch. Keep this single snake publisher; do not add a second workflow targeting the same branch.

## Important GitHub Actions setting

In repository **Settings → Actions → General → Workflow permissions**, allow **Read and write permissions** so workflows can commit generated SVG assets. The `profile-cards` action requires `contents: write`.

## Troubleshooting

- **Analytics cards are blank before the first run:** run `Generate self-hosted GitHub profile cards` manually once.
- **Workflow cannot commit:** check Actions workflow permissions and ensure `contents: write` is allowed.
- **A specific card is missing:** open the failed job log; the workflow generates one SVG per requested card and theme.
- **Streak looks different from the GitHub UI:** GitHub determines contributions according to its published contribution rules and the profile's private-contribution setting.
- **Monkeytype or coding-platform card unavailable:** open the direct profile link; those cards are third-party images.

GitHub profile READMEs do not execute arbitrary JavaScript. These profile interactions use links, animated SVG assets, theme-aware `<picture>` elements and expandable Markdown/HTML sections.
