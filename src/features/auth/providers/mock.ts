import type { AuthenticateInput, NoonIdentity, NoonIdentityProvider } from "./types";

/**
 * ⚠️ LOCAL DEVELOPMENT AUTH ONLY. This is NOT Noon login. The factory refuses to create it when
 * NODE_ENV=production.
 */
export const MOCK_PERSONAS = {
  "demo-student": {
    subject: "dev-student-001",
    profile: { noonStudentId: "DEV-NOON-1001", displayName: "سارة (تجريبي)", grade: "ثالث ثانوي" },
    role: "student",
    label: "طالبة تجريبية بسجل تقدّم",
  },
  "new-student": {
    subject: "dev-student-new",
    profile: {
      noonStudentId: "DEV-NOON-1999",
      displayName: "طالب جديد (تجريبي)",
      grade: "ثاني ثانوي",
    },
    role: "student",
    label: "طالب جديد بلا تقدّم",
  },
  "demo-admin": {
    subject: "dev-admin-001",
    profile: { noonStudentId: "DEV-NOON-ADMIN", displayName: "مشرف المحتوى (تجريبي)", grade: null },
    role: "admin",
    label: "مشرف محتوى",
  },
} as const satisfies Record<string, Omit<NoonIdentity, "provider"> & { label: string }>;

export type MockPersona = keyof typeof MOCK_PERSONAS;

export class MockIdentityProvider implements NoonIdentityProvider {
  readonly id = "mock" as const;

  async getAuthorizationRequest() {
    return null;
  }

  async authenticate(input: AuthenticateInput): Promise<NoonIdentity> {
    if (input.kind !== "mock" || !Object.hasOwn(MOCK_PERSONAS, input.persona)) {
      throw new Error("Unknown mock persona");
    }
    const p = MOCK_PERSONAS[input.persona as MockPersona];
    return { provider: "mock", subject: p.subject, profile: { ...p.profile }, role: p.role };
  }

  async refreshToken(): Promise<never> {
    throw new Error("Mock provider has no tokens");
  }

  async getStudentProfile(): Promise<never> {
    throw new Error("Mock provider has no remote profile");
  }
}
