"use server";

import { revalidatePath } from "next/cache";
import { assertUser } from "@/features/auth/dal";
import { runAction } from "@/lib/action-result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { updateProfile } from "./service";

/** Avatar & privacy only. Names come from Noon and cannot be changed here (rejected server-side). */
export async function updateProfileAction(input: unknown) {
  return runAction(
    async () => {
      const user = await assertUser();
      await enforceRateLimit(`profile:${user.id}`, 30, 60);
      await updateProfile(user.id, input);
      revalidatePath("/", "layout");
      return true;
    },
    { name_immutable: "اسمك يأتي من حسابك في نون ولا يمكن تعديله هنا.", invalid: "قيمة غير صالحة." },
  );
}
