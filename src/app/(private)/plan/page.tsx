import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { nextWeekStart, addDays } from "@/lib/calendar";
import { loadPlan } from "@/lib/meal-plans";
import { mealLabel } from "@/lib/plan-engine";
import { PlanningField, PlanningForm } from "../planning-forms";
export const metadata = { title: "Tjedni plan" };
export default async function Planner({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const u = await requireUser(),
    query = await searchParams,
    week = /^\d{4}-\d{2}-\d{2}$/.test(query.week ?? "")
      ? query.week!
      : nextWeekStart();
  const data = await loadPlan(
    db(),
    { userId: u.id, householdId: u.householdId },
    week,
  );
  const { plan } = data;
  const editable =
    !!plan && plan.ownerUserId === u.id && plan.status === "DRAFT";
  const recipes = editable
    ? await db().recipe.findMany({
        where: { householdId: u.householdId, archived: false },
        select: { id: true, title: true },
        orderBy: [{ title: "asc" }, { id: "asc" }],
        take: 501,
      })
    : [];
  return (
    <>
      <div className="intro">
        <div>
          <p className="eyebrow">Sedam dana · tvoji osobni ciljevi</p>
          <h1>Tjedni plan</h1>
          <p>
            Prijedlog prema receptima, zalihama i ograničenjima. Planiranje ne
            troši zalihe i ne upisuje obroke u dnevnik.
          </p>
        </div>
        <Link href="/recepti" className="button">
          Recepti
        </Link>
      </div>
      <form method="get" className="card form-grid">
        <PlanningField
          name="week"
          label="Početak tjedna (ponedjeljak)"
          type="date"
          value={week}
        />
        <button className="button">Prikaži tjedan</button>
      </form>
      <p>
        <Link href="/postavke">Osobni ciljevi i ograničenja</Link> ·{" "}
        <Link href="/plan/cijene">Procijenjene cijene</Link>
      </p>
      {!plan && (
        <section className="card">
          <h2>Izradi nacrt</h2>
          <p>
            Najprije spremi recepte i potvrdi ciljeve u Postavkama. Odabir je
            deterministički prijedlog; ciljevi i budžet provjeravaju se u
            izvještaju.
          </p>
          <PlanningForm
            key={week}
            operation="generate"
            values={{ weekStart: week, version: 0 }}
            requestKey={randomUUID()}
            label="Izradi sedmodnevni plan"
          />
        </section>
      )}
      {plan && (
        <>
          <section className="card">
            <h2>
              {plan.status === "APPROVED" ? "Odobreni plan" : "Nacrt plana"}
            </h2>
            <p>
              Autor: {plan.owner?.username ?? "stariji zapis"} · verzija{" "}
              {plan.version}
              {plan.approvedAt
                ? ` · odobreno ${plan.approvedAt.toISOString().slice(0, 10)}`
                : ""}
            </p>
            {plan.ownerUserId !== u.id && (
              <p className="notice">
                Plan može mijenjati i odobriti samo njegov autor.
              </p>
            )}
            {data.error && (
              <p className="error" role="alert">
                {data.error}
              </p>
            )}
            {data.stale && (
              <p className="notice">
                Ciljevi ili sastojci su promijenjeni. Ponovno izradi nacrt prije
                odobrenja.
              </p>
            )}
            {editable && (
              <PlanningForm
                key={`generate-${plan.version}`}
                operation="generate"
                values={{ weekStart: week, version: plan.version }}
                requestKey={randomUUID()}
                label="Ponovno izradi cijeli nacrt"
              />
            )}
          </section>
          {data.report && data.settings && (
            <>
              <section className="card mt-5">
                <h2>Provjera ciljeva i budžeta</h2>
                <p>
                  Ciljevi: {data.settings.calories / 100} kcal i{" "}
                  {data.settings.protein / 100} g proteina dnevno ·{" "}
                  {data.settings.mealCount} obroka. Budžet:{" "}
                  {data.settings.budget === null
                    ? "nije postavljen"
                    : `${(data.settings.budget / 100).toFixed(2)} €`}
                  .
                </p>
                <p>
                  Procjena dodatne nabave:{" "}
                  <strong>
                    {data.report.additionalCostEstimateCents === null
                      ? "nepoznata"
                      : `${(data.report.additionalCostEstimateCents / 100).toFixed(2)} €`}
                  </strong>
                  . Poznati dio:{" "}
                  {(data.report.knownCostEstimateCents / 100).toFixed(2)} €.
                  Nedostaje cijena za {data.report.unknownPriceCount} proizvoda.
                </p>
                <p className="muted">
                  Cijene su ručne procjene po kg. Trošak obuhvaća samo manjak
                  nakon raspoloživih zaliha, bez ambalaže i zaokruživanja na
                  pakiranja. Zalihe nisu rezervirane.{" "}
                  {plan.status === "APPROVED"
                    ? "Izvještaj je zamrznut pri odobrenju."
                    : "Izvještaj koristi trenutačne zalihe i cijene."}
                </p>
                {data.report.warnings.length ? (
                  <ul className="notice">
                    {data.report.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="notice">
                    Svi dani su unutar ±10 % kalorijskog cilja, dosežu proteine
                    i dodatna nabava je unutar procijenjenog budžeta.
                  </p>
                )}
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>kcal</th>
                        <th>Proteini (g)</th>
                        <th>Ugljikohidrati (g)</th>
                        <th>Masti (g)</th>
                        <th>Vlakna (g)</th>
                        <th>Ciljevi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.report.days.map((d) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td>{(d.calories / 100).toFixed(1)}</td>
                          <td>{(d.protein / 100).toFixed(1)}</td>
                          <td>{(d.carbs / 100).toFixed(1)}</td>
                          <td>{(d.fat / 100).toFixed(1)}</td>
                          <td>
                            {d.fiber === null
                              ? "Nepoznato"
                              : (d.fiber / 100).toFixed(1)}
                          </td>
                          <td>
                            {d.calorieWithin ? "kcal ✓" : "kcal odstupanje"} ·{" "}
                            {d.proteinMet ? "proteini ✓" : "proteini manjak"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details>
                  <summary>
                    Pregled nedostajućih količina (
                    {data.report.shortfalls.length})
                  </summary>
                  <ul>
                    {data.report.shortfalls.map((s) => (
                      <li key={s.productId}>
                        {s.name}: {s.missingMg / 1000} g ·{" "}
                        {s.estimateCents === null
                          ? "cijena nepoznata"
                          : `${(s.estimateCents / 100).toFixed(2)} € (procjena)`}
                      </li>
                    ))}
                  </ul>
                  <p>Ovo je pregled plana; popis kupnje dolazi u fazi 5.</p>
                </details>
              </section>
              <div className="plan-days">
                {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map(
                  (date) => (
                    <section className="card" key={date}>
                      <h2>{date}</h2>
                      {data.meals
                        ?.filter((m) => m.date === date)
                        .map((m) => (
                          <article className="planned-meal" key={m.id}>
                            <h3>
                              {mealLabel(m.slot, data.settings!.mealCount)} ·{" "}
                              <Link href={`/recepti/${m.recipeId}`}>
                                {m.stored.nutrition.name}
                              </Link>
                            </h3>
                            <p>
                              {m.servingsMilli / 1000} porcija ·{" "}
                              {m.stored.preparationMinutes +
                                m.stored.cookingMinutes}{" "}
                              min
                            </p>
                            {editable && (
                              <details>
                                <summary>
                                  Zamijeni recept ili prilagodi porciju
                                </summary>
                                <PlanningForm
                                  key={`${m.id}-${plan.version}`}
                                  operation="meal"
                                  values={{
                                    planId: plan.id,
                                    version: plan.version,
                                    mealId: m.id!,
                                  }}
                                  requestKey={randomUUID()}
                                  label="Spremi obrok"
                                >
                                  <label>
                                    Recept
                                    <select
                                      name="recipeId"
                                      defaultValue={m.recipeId}
                                    >
                                      {recipes.map((r) => (
                                        <option key={r.id} value={r.id}>
                                          {r.title}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <PlanningField
                                    name="servings"
                                    label="Broj porcija"
                                    value={String(m.servingsMilli / 1000)}
                                  />
                                </PlanningForm>
                                <PlanningForm
                                  operation="regenerate"
                                  values={{
                                    planId: plan.id,
                                    version: plan.version,
                                    mealId: m.id!,
                                  }}
                                  requestKey={randomUUID()}
                                  label="Predloži drugi obrok"
                                  key={`regenerate-${m.id}-${plan.version}`}
                                />
                              </details>
                            )}
                          </article>
                        ))}
                    </section>
                  ),
                )}
              </div>
            </>
          )}
          {editable && data.report && !data.stale && (
            <section className="card mt-5">
              <h2>Odobri plan</h2>
              <p>
                Odobreni plan čuva snimljene vrijednosti. Za daljnje izmjene
                ponovno otvori nacrt.
              </p>
              <PlanningForm
                key={`approve-${plan.version}`}
                operation="approve"
                values={{ planId: plan.id, version: plan.version }}
                requestKey={randomUUID()}
                label="Odobri tjedni plan"
              >
                {!!data.report.warnings.length && (
                  <label className="checkbox-label">
                    <input type="checkbox" name="acceptWarnings" required />
                    Pročitao/la sam odstupanja i prihvaćam ovaj prijedlog.
                  </label>
                )}
              </PlanningForm>
            </section>
          )}
          {plan.ownerUserId === u.id && plan.status === "APPROVED" && (
            <section className="card mt-5">
              <PlanningForm
                key={`reopen-${plan.version}`}
                operation="reopen"
                values={{ planId: plan.id, version: plan.version }}
                requestKey={randomUUID()}
                label="Ponovno otvori nacrt"
              />
            </section>
          )}
        </>
      )}
    </>
  );
}
