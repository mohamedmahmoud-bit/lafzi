import { requireUser } from "@/features/auth/dal";
import { getProfile } from "@/features/profile/service";
import { AVATAR_KEYS } from "@/config/brand-assets";
import { AvatarPicker } from "./avatar-picker";

export const metadata = { title: "اختر صورتك" };

export default async function AvatarPage() {
  const user = await requireUser();
  const p = (await getProfile(user.id))!;
  return <AvatarPicker current={p.avatar} name={p.officialName} avatars={[...AVATAR_KEYS]} />;
}
