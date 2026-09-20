# Phase 4.1 actual development status

Date: 2026-09-20

Implemented in this candidate:
- Unified users / identities / sessions / OTP challenges / staff roles.
- User and admin audience separation; server-side RBAC permissions.
- H5 phone challenge/verify API in isolated test mode.
- WeChat code login and server-side getPhoneNumber flow with fail-closed configuration.
- Unified user favorites, memberships, benefit grants, event registrations, support tickets, inbox messages.
- Normalized content tables for route, nodes, POIs, media metadata, walks/steps, home, banners, announcements, membership plans, benefits and events.
- Lossless import of the current reference catalog into normalized tables.
- Optimistic revision checks and content edit history.
- Explicit publish step; test/development releases remain `reference` and production continues to reject unapproved source/media.
- API routes for admin content counts/list/get/save/preview/publish and unified user query/actions.

Automated regression:
- 63/63 Node tests passed.
- Original 55 tests remain green.
- 8 new Phase 4.1/4.2 backend tests passed.

Verified normalized baseline:
- routes: 1
- nodes: 5
- pois: 21
- walks: 4
- steps: 9
- media metadata with an actual inherited source URL in this baseline: 9

Not yet claimed complete:
- H5 account UI has not yet been converted to the unified phone endpoints in this local candidate.
- The standalone native WeChat v2 source is included under apps/weapp-native but is not yet wired into this repository's build pipeline.
- Portable admin UI is not yet merged into this candidate; current backend admin APIs are implemented.
- Real SMS provider, WeChat real-account phone authorization, external image rights/reachability, AppDeploy deployment and WeChat physical-device testing remain unverified.
