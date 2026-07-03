# Faira

> Zimbabwe's trusted marketplace for buying and selling secondhand and imported goods.

Buy and sell anything — secondhand or new, imported or local — safely, with escrow-protected
local payments (EcoCash, OneMoney, Zimswitch), verified sellers, and tracked delivery.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native (Expo) + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL via Supabase + Prisma ORM |
| Storage | Cloudinary (images) |
| Payments | Paynow Zimbabwe (EcoCash, OneMoney, Zimswitch) |
| Hosting | Railway (API) + EAS Build (mobile) |

## Repo Structure

```
apps/
  api/       — Node/Express REST API
  mobile/    — React Native Expo app
infra/       — Docker, deployment configs
docs/        — Architecture docs, ADRs
.github/     — PR template, CODEOWNERS, CI workflows
```

## Getting Started

```bash
# Clone
git clone https://github.com/enosvambadata/faira.git
cd faira

# Backend
cd apps/api && npm install && npm run dev

# Mobile
cd apps/mobile && npm install && npx expo start
```

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production — protected, PR + 1 approval required |
| `develop` | Integration — protected, PR + 1 approval required |
| `feature/FAR-XXX-desc` | Feature branches off develop |
| `fix/FAR-XXX-desc` | Bug fix branches off develop |
| `hotfix/FAR-XXX-desc` | Urgent fixes off main |

## Commit Convention

```
feat(listings): add image upload to Cloudinary
fix(auth): prevent OTP reuse after expiry
chore(infra): add Railway deployment config
```

## Jira Board

[vambadata.atlassian.net/jira/software/projects/SCRUM/boards/1](https://vambadata.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog)
