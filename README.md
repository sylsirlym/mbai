# Mbai

A family tree service built for polygamous households and woman-to-woman marriages.

- A **household** comes into being when a man first marries. He is its head.
- Each wife has a **house** in it (House 1, 2, 3…).
- A wife can marry another wife. The new house sits under hers (House 2 → 2A → 2A-1 → …) and still belongs to the husband's household. There is no depth limit, and widows can still sponsor.
- Children are born into a house. **Who they belong to** comes from the house chain, and **biological parents** are stored separately, with the father optionally restricted to tree admins.
- Every person keeps the house they were **born into**. A son who marries also **heads** his own household.
- A **line** starts from a founder. Use **Add parents** on any founder to move the line up a generation, or to join two lines.

## Layout

```
api/   NestJS + Postgres (raw SQL, recursive queries). Rules live in src/family/family.service.ts
web/   React + Vite
Dockerfile          one image: the API also serves the built web app
docker-compose.yml  local Postgres + app
render.yaml         Render blueprint (app + managed Postgres)
```

## Run locally

With Docker:

```bash
docker compose up --build
# open http://localhost:3000
```

Without Docker (Node 22 and Postgres 16 installed):

```bash
createdb mbai
cd api && npm install
export DATABASE_URL=postgres://localhost:5432/mbai
npm run dev                 # API on :3000, runs migrations on start
npm run seed:dev            # optional demo data, login demo@mbai.app / demo12345

cd ../web && npm install
npm run dev                 # web on :5173, proxies /api to :3000
```

## Tests

```bash
createdb mbai_test
cd api && TEST_DATABASE_URL=postgres://localhost:5432/mbai_test npm test
```

The tests cover every marriage rule: household creation, sponsor chains, widows, ended houses, the death-date check, restricted fathers, add parents, cycle prevention, duplicate matching and merging, and access roles.

## Deploy to Render

1. Push this repo to GitHub.
2. On render.com: **New → Blueprint**, then pick the repo. Render reads `render.yaml` and creates the app and a Postgres database, with `JWT_SECRET` generated for you.
3. When the first deploy finishes, open the app URL and create your account. Migrations run automatically on start.

Optional demo data on the deployed database: open the service's **Shell** in Render and run `npm run seed`.

Environment variables:

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signs login tokens. Required in production |
| `DATABASE_SSL` | Set to `true` if your Postgres needs SSL from outside its network |
| `MIGRATE_ON_START` | Set to `false` to run `npm run migrate` yourself instead |
| `CORS_ORIGIN` | Only needed if the web app is hosted separately |

## Access

Each tree has members with a role. **Admins** see restricted details and can merge duplicates. **Editors** add and change records. **Viewers** can only look. Add people under **People with access**; they need an account first.

## API

All routes are under `/api` and need `Authorization: Bearer <token>` except `auth/register` and `auth/login`.

| Method | Route | What it does |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | Returns `{ user, token }` |
| GET/POST | `/trees` | List or create trees |
| GET/POST | `/trees/:id/members` | List members, or add one by email with a role |
| GET | `/trees/:id/households` | Households, with `is_founder` for lines |
| GET/POST | `/trees/:id/persons` | Search (`?q=`), or create a person with no parents (a founder) |
| GET | `/trees/:id/persons/matches` | Likely duplicates for `firstName`, `otherNames`, `birthYear` |
| POST | `/trees/:id/marriages` | `{ mode: "head", husbandId }` or `{ mode: "wife", sponsorHouseId }`, plus `bride` |
| POST | `/trees/:id/children` | `{ houseId }` or `{ motherId }`, plus `child` and `father` |
| GET | `/households/:id` | The nested house tree with children |
| GET/PATCH | `/persons/:id` | Profile, with birth house, marriages and chains, and parents |
| POST | `/persons/:id/parents` | Add parents to someone recorded without them |
| POST | `/persons/:id/merge` | Fold this person into `intoId` (admin only) |
| POST | `/houses/:id/end` | End a marriage (divorce, death, other). The house stays on the tree |
