import { profile } from "@/data/profile";
import { SectionHeading } from "@/components/SectionHeading";

export function Contact() {
  return (
    <section id="contact" className="mx-auto max-w-4xl px-6 py-16">
      <SectionHeading eyebrow="Contact" title="연락처" />
      <p className="max-w-xl text-sm leading-relaxed text-slate-600">
        새로운 기회나 협업 제안은 언제든 환영합니다. 아래 채널로 편하게 연락해주세요.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={`mailto:${profile.contact.email}`}
          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-600"
        >
          {profile.contact.email}
        </a>
        <a
          href={profile.contact.github}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-sky-600 hover:text-sky-600"
        >
          GitHub ↗
        </a>
      </div>
    </section>
  );
}
