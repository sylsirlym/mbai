// Thin client for the Mbai API. The token lives in localStorage (guarded, as storage can throw).

const TOKEN_KEY = 'mbai.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session-only login */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.location.assign('/login');
    }
    const issues = data?.issues?.map((i: any) => `${i.path}: ${i.message}`).join('; ');
    throw new ApiError(res.status, issues || data?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

// ----- shapes returned by the API -----

export interface Person {
  id: string;
  tree_id: string;
  first_name: string;
  other_names: string;
  sex: 'M' | 'F' | 'U';
  clan: string | null;
  birth_date: string | null;
  birth_year: number | null;
  birth_place: string | null;
  death_date: string | null;
  death_year: number | null;
  is_deceased: boolean;
  is_placeholder: boolean;
  notes: string | null;
  birth_house_id: string | null;
  heads_household_id?: string | null;
}

export interface PersonInput {
  firstName: string;
  otherNames?: string;
  sex: 'M' | 'F' | 'U';
  clan?: string;
  birthYear?: number;
  birthDate?: string;
  deathYear?: number;
  isDeceased?: boolean;
}
export type PersonRef = { id: string } | { new: PersonInput };

export interface Tree {
  id: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  people?: number;
}

export interface HouseholdSummary {
  id: string;
  head_id: string;
  head_name: string;
  is_founder: boolean;
  houses: number;
  people: number;
}

export interface ChildCard {
  id: string;
  first_name: string;
  other_names: string;
  sex: string;
  birth_year: number | null;
  is_deceased: boolean;
  heads_household_id: string | null;
  has_restricted_parent: boolean;
}

export interface HouseNode {
  id: string;
  label: string;
  marriage_form: string;
  started_on: string | null;
  ended_on: string | null;
  end_reason: string | null;
  sponsor_house_id: string | null;
  status: 'active' | 'widowed' | 'ended';
  wife: Person;
  children: ChildCard[];
  houses: HouseNode[];
}

export interface Household {
  id: string;
  treeId: string;
  head: Person;
  birthHousehold: { id: string; label: string; head_name: string } | null;
  houses: HouseNode[];
  counts: { houses: number; people: number };
  canSeeRestricted: boolean;
}

export const fullName = (p: { first_name: string; other_names: string }) =>
  [p.first_name, p.other_names].filter(Boolean).join(' ');

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');

export const lifespan = (p: Pick<Person, 'birth_year' | 'death_year' | 'is_deceased'>) => {
  if (p.birth_year && p.death_year) return `${p.birth_year} – ${p.death_year}`;
  if (p.birth_year) return p.is_deceased ? `b. ${p.birth_year}, deceased` : `b. ${p.birth_year}`;
  if (p.death_year) return `d. ${p.death_year}`;
  return p.is_deceased ? 'Deceased' : '';
};
