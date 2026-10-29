/* eslint-disable @next/next/no-img-element -- small static brand SVG/PNGs; next/image adds nothing here */
import { brandAssets, type IllustrationName } from "@/config/brand-assets";
import { cn } from "@/lib/utils";

/** The noon logo. Never recoloured, stretched or mirrored; aspect 1266 × 275. */
export function NoonLogo({ width = 96, className }: { width?: number; className?: string }) {
  return (
    <img
      src={brandAssets.logo}
      alt="noon"
      width={width}
      height={Math.round((width * 275) / 1266)}
      className={cn("shrink-0", className)}
      style={{ direction: "ltr" }}
    />
  );
}

/** The smile, lifted from the logo's curve. At most one per screen, tilted -6° to -8°. */
export function Smile({ width = 72, className }: { width?: number; className?: string }) {
  return (
    <img
      src={brandAssets.smile}
      alt=""
      aria-hidden
      width={width}
      height={Math.round((width * 420) / 900)}
      className={cn("-rotate-6", className)}
    />
  );
}

/** Brand illustration for human moments (welcomes, questions, celebration). */
export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return <img src={brandAssets.illustration(name)} alt="" aria-hidden className={cn("select-none", className)} />;
}

/** Student avatar drawn from the brand's character cast. */
export function Avatar({ avatar, size = 36, className }: { avatar: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-oak", className)}
      style={{ width: size, height: size }}
    >
      <img src={brandAssets.avatar(avatar)} alt="" width={size} height={size} />
    </span>
  );
}
