import "dotenv/config";
import { vi } from "vitest";
// `server-only` throws outside the React Server environment; tests import server modules directly.
vi.mock("server-only", () => ({}));
