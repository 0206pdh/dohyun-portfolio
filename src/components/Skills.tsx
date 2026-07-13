import { profile } from "@/data/profile";
import { SectionHeading } from "@/components/SectionHeading";

export function Skills() {
  const groups = Object.entries(profile.skills);

  return (
    <section id="skills" className="border-t border-slate-100 bg-slate-50/60">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <SectionHeading eyebrow="Skills" title="기술 스택" />
        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map(([category, items]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-slate-900">{category}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {items.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
