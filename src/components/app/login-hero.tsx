import { brand } from "@/config/brand";
import { Illustration, NoonLogo, Smile } from "./brand-art";

/** Login welcome: a waving character, the product name with the smile, and the noon logo. */
export function LoginHero() {
  return (
    <div className="flex flex-col items-center text-center">
      <Illustration name="char_pose_wave_hijab" className="-mb-4 h-auto w-36" />
      <div className="relative">
        <h1 className="font-display text-primary-ink text-6xl leading-tight font-bold">{brand.productName}</h1>
        <Smile width={64} className="absolute -bottom-3 left-1/2 -translate-x-1/2" />
      </div>
      <p className="mt-5 text-lg font-semibold">{brand.productTagline}</p>
      <p className="text-muted mt-1">كلمات جديدة كل يوم · سلسلة تحفّزك · تدريب موجّه في نون</p>
      <p className="text-muted mt-4 flex items-center gap-2 text-sm">
        من <NoonLogo width={72} />
      </p>
    </div>
  );
}
