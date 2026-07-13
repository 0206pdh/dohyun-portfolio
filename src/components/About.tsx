import { profile } from "@/data/profile";
import { SectionHeading } from "@/components/SectionHeading";

export function About() {
  const infoRows = [
    { label: "생년월일", value: profile.birthDate },
    ...profile.education.map((edu) => ({
      label: "학력",
      value: `${edu.school} ${edu.degree} (${edu.status})`,
    })),
    ...profile.training.map((t) => ({
      label: "교육",
      value: `${t.name} (${t.status})`,
    })),
  ];

  return (
    <section id="about" className="mx-auto max-w-4xl px-6 py-16">
      <SectionHeading eyebrow="About" title="소개" />
      <p className="max-w-2xl text-base leading-relaxed text-slate-600">
        {profile.bio}
      </p>
      <dl className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {infoRows.map((row) => (
          <div key={row.label + row.value} className="flex gap-3 text-sm">
            <dt className="w-16 shrink-0 font-medium text-slate-400">{row.label}</dt>
            <dd className="text-slate-700">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
