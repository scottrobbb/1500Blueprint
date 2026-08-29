// 1500 Blueprint mark — Blu, the brand mascot.

import Image from "next/image";

type LogoProps = { className?: string; withWordmark?: boolean };

export function Logo({ className, withWordmark = true }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Image
        src="/images/blu-idle.png"
        alt="1500 Blueprint"
        width={40}
        height={36}
        className="h-8 w-[35px] shrink-0 object-contain"
      />
      {withWordmark && (
        <span className="font-display font-extrabold leading-none tracking-tight">
          <span className="text-navy">1500</span>{" "}
          <span className="text-navy">Blueprint</span>
        </span>
      )}
    </span>
  );
}
