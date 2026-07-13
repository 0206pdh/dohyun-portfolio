import Image from "next/image";
import { profile } from "@/data/profile";

export function Hero() {
  return (
    <section
      id="top"
      className="mx-auto flex max-w-4xl flex-col-reverse items-center gap-10 px-6 pb-20 pt-16 sm:flex-row sm:pt-24"
    >
      <div className="flex-1 text-center sm:text-left">
        <p className="text-sm font-medium uppercase tracking-widest text-sky-600">
          {profile.title}
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          {profile.name}
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
          {profile.tagline}
        </p>
        <div className="mt-8 flex justify-center gap-3 sm:justify-start">
          <a
            href={`mailto:${profile.contact.email}`}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-600"
          >
            이메일 보내기
          </a>
          <a
            href={profile.contact.github}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-sky-600 hover:text-sky-600"
          >
            GitHub
          </a>
        </div>
      </div>
      <div className="h-36 w-36 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 sm:h-44 sm:w-44">
        <Image
          src={profile.avatarUrl}
          alt={profile.name}
          width={176}
          height={176}
          className="h-full w-full object-cover"
          priority
        />
      </div>
    </section>
  );
}
