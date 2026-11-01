# PROMAX GitHub Profile — Setup & Operations

Repository: https://github.com/lio-dinesh/lio-dinesh

## Installed files

- `README.md` — upgraded profile with animated hero, expanded technical ecosystem, projects, Monkeytype, LeetCode, GitHub analytics, Metrics, engineering foundations and collapsible sections.
- `.github/workflows/monkeytype-readme.yml` — refreshes the Monkeytype SVG every six hours and on manual dispatch.
- `.github/workflows/metrics.yml` — creates `assets/metrics.svg` with GitHub analytics, an isometric calendar, achievements, language activity and the LeetCode plugin.
- `.github/workflows/main.yml` — existing contribution-snake workflow. It was kept as-is; do not add a second workflow that publishes to the `output` branch.

## Required one-time setup: METRICS_TOKEN

GitHub Metrics needs a personal access token for some account-level data that the repository-scoped `GITHUB_TOKEN` cannot read.

1. In GitHub, open **Settings → Developer settings → Personal access tokens**.
2. Create a token following the current lowlighter/metrics setup guide. Start with the least privilege required for the public profile data you want; only add documented scopes if the action reports that they are needed.
3. Open this repository → **Settings → Secrets and variables → Actions**.
4. Click **New repository secret**.
5. Set the name to `METRICS_TOKEN` and paste the token as its value.
6. Never put this token in README, YAML files, issues or chat.
7. Open **Actions → Update GitHub profile metrics → Run workflow**.
8. When the run succeeds, confirm `assets/metrics.svg` exists on `main` and refresh the profile.

Official setup: https://github.com/lowlighter/metrics/blob/master/.github/readme/partials/documentation/setup/action.md

## Monkeytype

- Profile: https://monkeytype.com/profile/lio_dinesh
- README card: `https://monkeytypecard.vercel.app/monkeytype.svg?username=lio_dinesh&theme=serika_dark&timeValue=60&wordValue=50`.
- The card is rendered directly from the public Monkeytype profile using the Monkeytype Card SVG service; it does not require a GitHub Actions workflow or API key.
- The older `monkeytype-readme` action was removed because its Zeabur generator returned plain `Not Found` content instead of SVGs. Old files remain in the historical `monkeytype-readme` branch but are no longer referenced.
- If the image does not load, open the Monkeytype profile directly and check that the profile is public and has typing-test data. The external card service may be unavailable or may change its API.

Card project: https://github.com/Xander-Murray/monkeytypecard

## LeetCode

- Profile: https://leetcode.com/u/41072514801010/
- README includes a LeetCard heatmap and the Metrics LeetCode plugin.
- The numeric identifier may or may not be accepted as a username by third-party card providers. If the image fails, keep the direct profile link and replace the image endpoint with the public LeetCode username/slug shown by LeetCode.
- The Metrics LeetCode plugin is configured non-fatally; if it cannot resolve the identifier, other GitHub Metrics sections should still render.

LeetCard documentation: https://github.com/RuthinAustac/LeetCard
Metrics LeetCode support: https://github.com/lowlighter/metrics/releases

## Contribution snake

The existing `.github/workflows/main.yml` already generates `github-snake.svg` and `github-snake-dark.svg` and publishes them to the `output` branch. Keep this single publisher. Do not add another `snake.yml` unless you first disable the existing publisher.


## CodeChef

- Profile: https://www.codechef.com/users/dce_25148010
- The README embeds the CodeChef public stats SVG at `https://codechef-stats.tashif.codes/dce_25148010/stats/svg?theme=dark`. This is an independent service that scrapes public CodeChef profile data; it is not an official CodeChef API and can be rate-limited or unavailable.
- CodeChef certificates are available from the signed-in certificate dashboard: https://www.codechef.com/certificates
- CodeChef supports shareable certificate URLs. Open the certificate dashboard, use the certificate's Share action, and copy the individual shareable URL into the README's CodeChef certification section. The verification page is https://www.codechef.com/certificates/verify.
- A certificate ID and username are required by the verification form. Do not invent these details or publish an unverified credential.
- Official CodeChef certification FAQ: https://www.codechef.com/certifications/data-structures-and-algorithms/faq

## WakaTime (not enabled)

WakaTime is not configured because no WakaTime profile or API key was supplied. To add it later, save its API key as a repository Actions secret (for example `WAKATIME_API_KEY`) and use the official WakaTime README workflow. Never commit the key.

## Troubleshooting

- **Monkeytype card missing:** check the workflow run; confirm `monkeytype-readme` branch and actual generated SVG filename.
- **Metrics workflow fails immediately:** confirm `METRICS_TOKEN` exists as an Actions secret and is valid.
- **Metrics data incomplete:** follow the Metrics documentation for the minimum permissions required by enabled plugins.
- **LeetCode card missing:** verify the public username/slug expected by the third-party service; retain the direct profile link.
- **Snake duplicated or failing:** inspect `main.yml`; keep only one workflow publishing to `output`.
- **External image temporarily unavailable:** GitHub READMEs render third-party SVGs as images. The README keeps direct profile/repository links as fallbacks.

GitHub profile READMEs do not execute arbitrary JavaScript. The interactive experience here uses animated SVGs, clickable links, HTML disclosure sections, Mermaid-compatible diagrams where added, and automatically refreshed GitHub Actions output.
