"use client";

import { useMemo, useState } from "react";

type User = {
  displayName: string;
  email: string;
  isPreview: boolean;
};

type MonthlyMetric = {
  month: string;
  monthNumber: number;
  target: number;
  sold: number;
  adjusted: number;
  adjustmentRate: number;
  gap: number;
  attainment: number;
  health: string;
};

type Deal = {
  id: string;
  month: string;
  monthNumber: number;
  owner: string;
  company: string;
  origin: string;
  sold: number;
  governedSold: number;
  adjusted: number;
  proposalAcceptedAt: string | null;
  contractSignedAt: string | null;
  billed: number;
  variance: number;
  billingStatus: string;
};

type HistoricalDeal = {
  id: string;
  semester: number;
  company: string;
  sold: number;
  billed: number;
  soldAt: string | null;
  owner: string;
};

type KeyResult = {
  title: string;
  actual: number;
  target: number;
  unit: string;
  inverse?: boolean;
};

type Objective = {
  id: string;
  title: string;
  owner: string;
  cadence: string;
  progress: number;
  keyResults: KeyResult[];
};

type RawSheet = {
  name: string;
  rowCount: number;
  columnCount: number;
  nonEmptyCells: number;
  formulaCells: number;
  rows: unknown[][];
  formulas: unknown[][];
};

type CommercialData = {
  meta: {
    sourceFile: string;
    generatedAt: string;
    workbookSheets: number;
    importedCells: number;
    formulaCells: number;
    records2026: number;
    historicalRecords: number;
  };
  executiveSummary: {
    ytdTarget: number;
    ytdSold: number;
    ytdAdjusted: number;
    ytdGap: number;
    attainment: number;
    realization: number;
    averageSalesCycle: number;
    julyForecast: number;
    julyPending: number;
  };
  monthlyMetrics: MonthlyMetric[];
  deals2026: Deal[];
  historicalDeals: HistoricalDeal[];
  ownerPerformance: Array<{
    owner: string;
    deals: number;
    sold: number;
    adjusted: number;
    billed: number;
  }>;
  originPerformance: Array<{
    origin: string;
    deals: number;
    adjusted: number;
  }>;
  objectives: Objective[];
  governance: {
    operatingRhythm: Array<{
      cadence: string;
      ritual: string;
      owner: string;
      evidence: string;
    }>;
    roles: Array<{
      role: string;
      view: boolean;
      edit: boolean;
      approve: boolean;
      manageUsers: boolean;
    }>;
    approvalRules: string[];
  };
  dataQualityIssues: Array<{
    severity: string;
    category: string;
    title: string;
    description: string;
    owner: string;
  }>;
  rawSheets: RawSheet[];
};

type Section =
  | "visao"
  | "pipeline"
  | "okrs"
  | "equipe"
  | "governanca"
  | "dados";

const navItems: Array<{ id: Section; label: string; index: string }> = [
  { id: "visao", label: "Visão executiva", index: "01" },
  { id: "pipeline", label: "Negócios", index: "02" },
  { id: "okrs", label: "OKRs", index: "03" },
  { id: "equipe", label: "Equipe & canais", index: "04" },
  { id: "governanca", label: "Governança", index: "05" },
  { id: "dados", label: "Base completa", index: "06" },
];

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const preciseCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatKeyResult(value: number, unit: string) {
  if (unit === "currency") return currency.format(value);
  if (unit === "percent") return percent.format(value);
  if (unit === "multiple") return `${value.toFixed(1).replace(".", ",")}x`;
  if (unit === "days") return `${value.toFixed(1).replace(".", ",")} dias`;
  return value.toLocaleString("pt-BR");
}

function healthLabel(value: number) {
  if (value >= 1) return "Meta superada";
  if (value >= 0.7) return "Em atenção";
  return "Ação necessária";
}

function downloadCsv(deals: Deal[]) {
  const rows = [
    [
      "Mês",
      "Empresa",
      "Responsável",
      "Origem",
      "Valor vendido",
      "Valor ajustado",
      "Faturado",
      "Status",
    ],
    ...deals.map((deal) => [
      deal.month,
      deal.company,
      deal.owner,
      deal.origin,
      deal.sold,
      deal.adjusted,
      deal.billed,
      deal.billingStatus,
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(";"),
    )
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "atlas-negocios-2026.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CommercialControl({
  data,
  user,
}: {
  data: CommercialData;
  user: User;
}) {
  const [section, setSection] = useState<Section>("visao");
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("Todos");
  const [ownerFilter, setOwnerFilter] = useState("Todos");
  const [selectedOwner, setSelectedOwner] = useState(
    data.ownerPerformance[0]?.owner ?? "",
  );
  const [selectedSheet, setSelectedSheet] = useState(data.rawSheets[0]?.name ?? "");
  const [sheetSearch, setSheetSearch] = useState("");
  const [sheetMode, setSheetMode] = useState<"values" | "formulas">("values");

  const owners = useMemo(
    () =>
      [...new Set(data.deals2026.map((deal) => deal.owner))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [data.deals2026],
  );

  const filteredDeals = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return data.deals2026.filter((deal) => {
      const matchesQuery =
        !query ||
        deal.company.toLocaleLowerCase("pt-BR").includes(query) ||
        deal.owner.toLocaleLowerCase("pt-BR").includes(query) ||
        deal.origin.toLocaleLowerCase("pt-BR").includes(query);
      const matchesMonth =
        monthFilter === "Todos" || deal.month === monthFilter;
      const matchesOwner =
        ownerFilter === "Todos" || deal.owner === ownerFilter;
      return matchesQuery && matchesMonth && matchesOwner;
    });
  }, [data.deals2026, monthFilter, ownerFilter, search]);

  const selectedOwnerDeals = useMemo(
    () => data.deals2026.filter((deal) => deal.owner === selectedOwner),
    [data.deals2026, selectedOwner],
  );

  const selectedOwnerDashboard = useMemo(() => {
    const sold = selectedOwnerDeals.reduce((sum, deal) => sum + deal.sold, 0);
    const adjusted = selectedOwnerDeals.reduce(
      (sum, deal) => sum + deal.adjusted,
      0,
    );
    const billed = selectedOwnerDeals.reduce(
      (sum, deal) => sum + deal.billed,
      0,
    );
    const cycles = selectedOwnerDeals
      .map((deal) => {
        if (!deal.proposalAcceptedAt || !deal.contractSignedAt) return null;
        const start = new Date(`${deal.proposalAcceptedAt}T00:00:00`);
        const end = new Date(`${deal.contractSignedAt}T00:00:00`);
        return Math.max(
          0,
          Math.round((end.getTime() - start.getTime()) / 86_400_000),
        );
      })
      .filter((days): days is number => days !== null);
    const origins = selectedOwnerDeals.reduce<Record<string, number>>(
      (accumulator, deal) => {
        const origin = deal.origin || "Não informado";
        accumulator[origin] = (accumulator[origin] ?? 0) + 1;
        return accumulator;
      },
      {},
    );
    const topOrigin =
      Object.entries(origins).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "Sem dados";
    const months = data.monthlyMetrics.map((metric) => {
      const deals = selectedOwnerDeals.filter(
        (deal) => deal.monthNumber === metric.monthNumber,
      );
      return {
        month: metric.month,
        shortMonth: metric.month.slice(0, 3),
        deals: deals.length,
        adjusted: deals.reduce((sum, deal) => sum + deal.adjusted, 0),
      };
    });

    return {
      sold,
      adjusted,
      billed,
      ticket: selectedOwnerDeals.length
        ? adjusted / selectedOwnerDeals.length
        : 0,
      realization: sold ? adjusted / sold : 0,
      averageCycle: cycles.length
        ? cycles.reduce((sum, days) => sum + days, 0) / cycles.length
        : 0,
      waiting: selectedOwnerDeals.filter((deal) =>
        deal.billingStatus.toLocaleLowerCase("pt-BR").includes("aguardando"),
      ).length,
      topOrigin,
      months,
    };
  }, [data.monthlyMetrics, selectedOwnerDeals]);

  const selectedOwnerMaxMonth = Math.max(
    ...selectedOwnerDashboard.months.map((month) => month.adjusted),
    1,
  );

  const currentSheet =
    data.rawSheets.find((sheet) => sheet.name === selectedSheet) ??
    data.rawSheets[0];
  const currentMatrix =
    sheetMode === "values" ? currentSheet?.rows : currentSheet?.formulas;
  const visibleSheetRows = useMemo(() => {
    const query = sheetSearch.trim().toLocaleLowerCase("pt-BR");
    return (currentMatrix ?? [])
      .map((row, index) => ({ row, rowNumber: index + 1 }))
      .filter(
        ({ row }) =>
          !query ||
          row.some((cell) =>
            String(cell ?? "")
              .toLocaleLowerCase("pt-BR")
              .includes(query),
          ),
      );
  }, [currentMatrix, sheetSearch]);

  const maxMonthly = Math.max(
    ...data.monthlyMetrics.flatMap((metric) => [metric.target, metric.adjusted]),
  );
  const maxOrigin = Math.max(
    ...data.originPerformance.map((item) => item.adjusted),
    1,
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img src="/atlas-logo.png" alt="Atlas" className="brand-logo" />
          <span>Comercial 360</span>
        </div>

        <nav className="main-nav" aria-label="Navegação principal">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setSection(item.id)}
            >
              <span className="nav-index">{item.index}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-proof">
          <span className="proof-label">Base governada</span>
          <strong>{data.meta.workbookSheets} abas importadas</strong>
          <span>{data.meta.importedCells.toLocaleString("pt-BR")} células preservadas</span>
          <div className="proof-line">
            <i />
            Sincronização validada
          </div>
        </div>

        <div className="sidebar-footer">
          <span className="lock-dot">●</span>
          Acesso privado e autenticado
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Controle comercial · 2026</span>
            <h1>{navItems.find((item) => item.id === section)?.label}</h1>
          </div>
          <div className="user-area">
            <div className="period-chip">
              <span>Período</span>
              <strong>Jan — Jul 2026</strong>
            </div>
            <div className="user-chip">
              <span className="user-avatar">{initials(user.displayName)}</span>
              <span className="user-copy">
                <strong>{user.displayName}</strong>
                <small>
                  {user.isPreview ? "Acesso público temporário" : user.email}
                </small>
              </span>
            </div>
            {!user.isPreview && (
              <a
                className="signout-link"
                href="/signout-with-chatgpt?return_to=%2F"
              >
                Sair
              </a>
            )}
          </div>
        </header>

        <div className="mobile-nav" aria-label="Navegação móvel">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? "active" : ""}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {section === "visao" && (
          <section className="page-content">
            <div className="executive-hero">
              <div className="hero-copy">
                <span className="section-kicker">Receita governada</span>
                <h2>
                  O que foi vendido importa.
                  <br />
                  <em>O que virou receita decide.</em>
                </h2>
                <p>
                  A operação atingiu {percent.format(data.executiveSummary.attainment)} da
                  meta acumulada, com uma diferença de{" "}
                  {currency.format(Math.abs(data.executiveSummary.ytdGap))}. O
                  painel separa valor comercial, ajuste e faturamento para
                  sustentar decisões confiáveis.
                </p>
              </div>
              <div className="hero-number">
                <span>Receita ajustada acumulada</span>
                <strong>{currency.format(data.executiveSummary.ytdAdjusted)}</strong>
                <div className="hero-progress">
                  <i
                    style={{
                      width: `${Math.min(data.executiveSummary.attainment * 100, 100)}%`,
                    }}
                  />
                </div>
                <div className="hero-number-meta">
                  <span>
                    Meta <b>{currency.format(data.executiveSummary.ytdTarget)}</b>
                  </span>
                  <span className="negative">
                    Gap <b>{currency.format(data.executiveSummary.ytdGap)}</b>
                  </span>
                </div>
              </div>
              <div className="atlas-angle" aria-hidden="true" />
            </div>

            <div className="kpi-grid">
              <article className="kpi-card">
                <span>Realização da meta</span>
                <strong>{percent.format(data.executiveSummary.attainment)}</strong>
                <small>{healthLabel(data.executiveSummary.attainment)}</small>
              </article>
              <article className="kpi-card">
                <span>Conversão em receita</span>
                <strong>{percent.format(data.executiveSummary.realization)}</strong>
                <small>ajustado ÷ vendido</small>
              </article>
              <article className="kpi-card">
                <span>Ciclo comercial médio</span>
                <strong>{data.executiveSummary.averageSalesCycle.toFixed(1).replace(".", ",")}d</strong>
                <small>proposta até assinatura</small>
              </article>
              <article className="kpi-card accent">
                <span>Forecast de julho</span>
                <strong>{currency.format(data.executiveSummary.julyForecast)}</strong>
                <small>
                  {(
                    data.executiveSummary.julyForecast /
                    data.monthlyMetrics[6].target
                  )
                    .toFixed(1)
                    .replace(".", ",")}
                  x cobertura da meta
                </small>
              </article>
            </div>

            <div className="overview-grid">
              <article className="panel revenue-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Performance mensal</span>
                    <h3>Meta vs. receita ajustada</h3>
                  </div>
                  <div className="legend">
                    <span><i className="legend-target" /> Meta</span>
                    <span><i className="legend-actual" /> Ajustado</span>
                  </div>
                </div>
                <div className="bar-chart">
                  {data.monthlyMetrics.map((metric) => (
                    <div className="bar-group" key={metric.month}>
                      <div className="bar-values">
                        <span>{currency.format(metric.adjusted)}</span>
                      </div>
                      <div className="bar-pair">
                        <i
                          className="bar target"
                          style={{
                            height: `${Math.max((metric.target / maxMonthly) * 100, 4)}%`,
                          }}
                        />
                        <i
                          className="bar actual"
                          style={{
                            height: `${Math.max((metric.adjusted / maxMonthly) * 100, 4)}%`,
                          }}
                        />
                      </div>
                      <strong>{metric.month.slice(0, 3)}</strong>
                      <small className={`health-${metric.health}`}>
                        {percent.format(metric.attainment)}
                      </small>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel attention-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Sala de decisão</span>
                    <h3>Pontos que pedem ação</h3>
                  </div>
                  <span className="issue-count">
                    {data.dataQualityIssues.length} alertas
                  </span>
                </div>
                <div className="attention-list">
                  {data.dataQualityIssues.slice(0, 4).map((issue, index) => (
                    <button
                      type="button"
                      key={`${issue.title}-${index}`}
                      onClick={() => setSection("governanca")}
                    >
                      <span className={`severity ${issue.severity}`}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <strong>{issue.title}</strong>
                        <small>{issue.owner}</small>
                      </span>
                      <b>→</b>
                    </button>
                  ))}
                </div>
              </article>
            </div>

            <div className="decision-strip">
              <div>
                <span className="section-kicker">Próxima decisão</span>
                <h3>Julho tem demanda suficiente. O foco é converter com qualidade.</h3>
              </div>
              <div className="decision-stat">
                <span>Pendente de assinatura</span>
                <strong>{currency.format(data.executiveSummary.julyPending)}</strong>
              </div>
              <div className="decision-stat">
                <span>Forecast total</span>
                <strong>{currency.format(data.executiveSummary.julyForecast)}</strong>
              </div>
              <button type="button" onClick={() => setSection("pipeline")}>
                Abrir negócios <b>→</b>
              </button>
            </div>
          </section>
        )}

        {section === "pipeline" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Carteira comercial</span>
                <h2>Negócios com contexto, valor e responsável.</h2>
                <p>
                  {data.meta.records2026} registros de 2026 foram estruturados a
                  partir das abas mensais, sem apagar as versões consolidadas.
                </p>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => downloadCsv(filteredDeals)}
              >
                Exportar seleção
              </button>
            </div>

            <div className="filter-bar">
              <label className="search-field">
                <span>Buscar</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Empresa, responsável ou origem"
                />
              </label>
              <label>
                <span>Mês</span>
                <select
                  value={monthFilter}
                  onChange={(event) => setMonthFilter(event.target.value)}
                >
                  <option>Todos</option>
                  {data.monthlyMetrics.map((metric) => (
                    <option key={metric.month}>{metric.month}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Responsável</span>
                <select
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value)}
                >
                  <option>Todos</option>
                  {owners.map((owner) => (
                    <option key={owner}>{owner}</option>
                  ))}
                </select>
              </label>
              <div className="filter-result">
                <span>Resultado</span>
                <strong>{filteredDeals.length} negócios</strong>
              </div>
            </div>

            <article className="panel table-panel">
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Mês</th>
                      <th>Responsável</th>
                      <th>Origem</th>
                      <th>Vendido</th>
                      <th>Ajustado</th>
                      <th>Faturamento</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeals.map((deal) => (
                      <tr key={deal.id}>
                        <td>
                          <strong>{deal.company}</strong>
                          <small>{deal.id}</small>
                        </td>
                        <td>{deal.month}</td>
                        <td>
                          <span className="owner-cell">
                            <i>{initials(deal.owner)}</i>
                            {deal.owner}
                          </span>
                        </td>
                        <td>{deal.origin}</td>
                        <td>{preciseCurrency.format(deal.sold)}</td>
                        <td className="emphasis">
                          {preciseCurrency.format(deal.adjusted)}
                        </td>
                        <td>{preciseCurrency.format(deal.billed)}</td>
                        <td>
                          <span
                            className={`status-pill ${
                              deal.billingStatus.includes("Aguardando")
                                ? "waiting"
                                : deal.variance < 0
                                  ? "negative"
                                  : "positive"
                            }`}
                          >
                            {deal.billingStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {section === "okrs" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Execução da estratégia</span>
                <h2>OKRs ligados aos dados que já existem.</h2>
                <p>
                  Objetivos de receita, previsibilidade e qualidade, com
                  responsáveis, cadência e resultados-chave mensuráveis.
                </p>
              </div>
              <span className="cycle-badge">Ciclo atual · Q3 2026</span>
            </div>

            <div className="okr-grid">
              {data.objectives.map((objective) => (
                <article className="okr-card" key={objective.id}>
                  <div className="okr-head">
                    <span>{objective.id}</span>
                    <i>{healthLabel(objective.progress)}</i>
                  </div>
                  <h3>{objective.title}</h3>
                  <div className="okr-owner">
                    <span>{initials(objective.owner)}</span>
                    <div>
                      <strong>{objective.owner}</strong>
                      <small>Revisão {objective.cadence.toLowerCase()}</small>
                    </div>
                  </div>
                  <div className="okr-progress">
                    <div>
                      <span>Progresso</span>
                      <strong>{percent.format(objective.progress)}</strong>
                    </div>
                    <i>
                      <b
                        style={{
                          width: `${Math.min(objective.progress * 100, 100)}%`,
                        }}
                      />
                    </i>
                  </div>
                  <div className="kr-list">
                    {objective.keyResults.map((result) => {
                      const rawProgress = result.inverse
                        ? result.target / Math.max(result.actual, 0.0001)
                        : result.actual / Math.max(result.target, 0.0001);
                      return (
                        <div key={result.title}>
                          <span>
                            <small>{result.title}</small>
                            <strong>
                              {formatKeyResult(result.actual, result.unit)}
                            </strong>
                          </span>
                          <span className="kr-target">
                            Meta {formatKeyResult(result.target, result.unit)}
                          </span>
                          <i>
                            <b
                              style={{
                                width: `${Math.min(rawProgress * 100, 100)}%`,
                              }}
                            />
                          </i>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>

            <div className="okr-note">
              <img src="/atlas-symbol.png" alt="" />
              <div>
                <strong>Regra de ouro</strong>
                <p>
                  O OKR não substitui a operação. Ele cria foco, enquanto o CRM
                  registra a evidência que sustenta cada resultado-chave.
                </p>
              </div>
            </div>
          </section>
        )}

        {section === "equipe" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Produtividade comercial</span>
                <h2>Um dashboard completo para cada vendedor.</h2>
                <p>
                  Selecione um responsável para visualizar seus indicadores,
                  evolução mensal e todos os negócios da carteira.
                </p>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => downloadCsv(selectedOwnerDeals)}
              >
                Exportar {selectedOwner}
              </button>
            </div>

            <div className="seller-selector" aria-label="Selecionar vendedor">
              {data.ownerPerformance.map((person, index) => (
                <button
                  type="button"
                  key={person.owner}
                  className={selectedOwner === person.owner ? "active" : ""}
                  onClick={() => setSelectedOwner(person.owner)}
                  aria-pressed={selectedOwner === person.owner}
                >
                  <span>{initials(person.owner)}</span>
                  <span>
                    <strong>{person.owner}</strong>
                    <small>
                      {person.deals} negócios · {currency.format(person.adjusted)}
                    </small>
                  </span>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                </button>
              ))}
            </div>

            <article className="seller-hero">
              <div className="seller-identity">
                <span>{initials(selectedOwner)}</span>
                <div>
                  <small>Dashboard individual</small>
                  <h3>{selectedOwner}</h3>
                  <p>
                    {selectedOwnerDeals.length} negócios entre janeiro e julho
                    de 2026.
                  </p>
                </div>
              </div>
              <div className="seller-share">
                <span>Participação na receita ajustada</span>
                <strong>
                  {percent.format(
                    selectedOwnerDashboard.adjusted /
                      Math.max(data.executiveSummary.ytdAdjusted, 1),
                  )}
                </strong>
                <i>
                  <b
                    style={{
                      width: `${Math.min(
                        (selectedOwnerDashboard.adjusted /
                          Math.max(data.executiveSummary.ytdAdjusted, 1)) *
                          100,
                        100,
                      )}%`,
                    }}
                  />
                </i>
              </div>
            </article>

            <div className="seller-kpi-grid">
              <article>
                <span>Receita ajustada</span>
                <strong>{currency.format(selectedOwnerDashboard.adjusted)}</strong>
                <small>Valor governado da carteira</small>
              </article>
              <article>
                <span>Valor vendido</span>
                <strong>{currency.format(selectedOwnerDashboard.sold)}</strong>
                <small>
                  {percent.format(selectedOwnerDashboard.realization)} realizado
                </small>
              </article>
              <article>
                <span>Ticket médio</span>
                <strong>{currency.format(selectedOwnerDashboard.ticket)}</strong>
                <small>{selectedOwnerDeals.length} contratos</small>
              </article>
              <article>
                <span>Ciclo médio</span>
                <strong>
                  {selectedOwnerDashboard.averageCycle
                    .toFixed(1)
                    .replace(".", ",")}{" "}
                  dias
                </strong>
                <small>Da proposta à assinatura</small>
              </article>
              <article>
                <span>Faturado</span>
                <strong>{currency.format(selectedOwnerDashboard.billed)}</strong>
                <small>{selectedOwnerDashboard.waiting} aguardando faturamento</small>
              </article>
              <article>
                <span>Principal origem</span>
                <strong className="text-value">
                  {selectedOwnerDashboard.topOrigin}
                </strong>
                <small>Canal mais frequente</small>
              </article>
            </div>

            <div className="seller-detail-grid">
              <article className="panel seller-month-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Evolução mensal</span>
                    <h3>Receita ajustada de {selectedOwner}</h3>
                  </div>
                </div>
                <div className="seller-month-chart">
                  {selectedOwnerDashboard.months.map((month) => (
                    <div key={month.month}>
                      <span>{currency.format(month.adjusted)}</span>
                      <i>
                        <b
                          style={{
                            height: `${Math.max(
                              (month.adjusted / selectedOwnerMaxMonth) * 100,
                              month.adjusted ? 5 : 0,
                            )}%`,
                          }}
                        />
                      </i>
                      <strong>{month.shortMonth}</strong>
                      <small>{month.deals} negócios</small>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel seller-summary-panel">
                <span className="section-kicker">Leitura rápida</span>
                <h3>Resumo da carteira</h3>
                <dl>
                  <div>
                    <dt>Maior negócio</dt>
                    <dd>
                      {currency.format(
                        Math.max(...selectedOwnerDeals.map((deal) => deal.adjusted), 0),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Realização vendido × ajustado</dt>
                    <dd>{percent.format(selectedOwnerDashboard.realization)}</dd>
                  </div>
                  <div>
                    <dt>Pendências de faturamento</dt>
                    <dd>{selectedOwnerDashboard.waiting}</dd>
                  </div>
                  <div>
                    <dt>Canal predominante</dt>
                    <dd>{selectedOwnerDashboard.topOrigin}</dd>
                  </div>
                </dl>
              </article>
            </div>

            <article className="panel seller-deals-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Carteira separada</span>
                  <h3>Negócios de {selectedOwner}</h3>
                </div>
                <span>{selectedOwnerDeals.length} registros</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Mês</th>
                      <th>Origem</th>
                      <th>Vendido</th>
                      <th>Ajustado</th>
                      <th>Faturamento</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOwnerDeals.map((deal) => (
                      <tr key={deal.id}>
                        <td>
                          <strong>{deal.company}</strong>
                          <small>{deal.id}</small>
                        </td>
                        <td>{deal.month}</td>
                        <td>{deal.origin}</td>
                        <td>{preciseCurrency.format(deal.sold)}</td>
                        <td className="emphasis">
                          {preciseCurrency.format(deal.adjusted)}
                        </td>
                        <td>{preciseCurrency.format(deal.billed)}</td>
                        <td>
                          <span
                            className={`status-pill ${
                              deal.billingStatus.includes("Aguardando")
                                ? "waiting"
                                : deal.variance < 0
                                  ? "negative"
                                  : "positive"
                            }`}
                          >
                            {deal.billingStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <div className="team-grid">
              <article className="panel ranking-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Ranking</span>
                    <h3>Receita ajustada por responsável</h3>
                  </div>
                </div>
                <div className="ranking-list">
                  {data.ownerPerformance.map((person, index) => (
                    <div key={person.owner}>
                      <span className="rank-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="ranking-avatar">
                        {initials(person.owner)}
                      </span>
                      <span className="ranking-name">
                        <strong>{person.owner}</strong>
                        <small>{person.deals} negócios</small>
                      </span>
                      <span className="ranking-value">
                        <strong>{currency.format(person.adjusted)}</strong>
                        <small>
                          {percent.format(
                            person.adjusted /
                              data.executiveSummary.ytdAdjusted,
                          )}{" "}
                          do total
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel channel-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Aquisição</span>
                    <h3>Participação dos canais</h3>
                  </div>
                </div>
                <div className="channel-list">
                  {data.originPerformance.map((origin, index) => (
                    <div key={origin.origin}>
                      <span className="channel-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="channel-info">
                        <strong>{origin.origin}</strong>
                        <small>{origin.deals} negócios</small>
                        <i>
                          <b
                            style={{
                              width: `${(origin.adjusted / maxOrigin) * 100}%`,
                            }}
                          />
                        </i>
                      </span>
                      <strong>{currency.format(origin.adjusted)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <article className="panel historical-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Histórico preservado</span>
                  <h3>Base de 2025 disponível para comparação</h3>
                </div>
                <span>{data.meta.historicalRecords} registros</span>
              </div>
              <div className="historical-summary">
                {[1, 2].map((semester) => {
                  const rows = data.historicalDeals.filter(
                    (deal) => deal.semester === semester,
                  );
                  const sold = rows.reduce((sum, deal) => sum + deal.sold, 0);
                  const billed = rows.reduce((sum, deal) => sum + deal.billed, 0);
                  return (
                    <div key={semester}>
                      <span>{semester}º semestre 2025</span>
                      <strong>{currency.format(billed)}</strong>
                      <small>
                        {rows.length} negócios · {currency.format(sold)} vendido
                      </small>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setSection("dados")}>
                  Consultar todas as linhas <b>→</b>
                </button>
              </div>
            </article>
          </section>
        )}

        {section === "governanca" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Governança comercial</span>
                <h2>Ritmo, responsabilidade e trilha de decisão.</h2>
                <p>
                  A planilha passa a operar com donos claros, critérios de
                  aprovação e uma rotina de revisão adequada à escala.
                </p>
              </div>
              <span className="security-badge">Acesso privado · SIWC</span>
            </div>

            <div className="governance-grid">
              <article className="panel rhythm-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Modelo operacional</span>
                    <h3>Cadência de gestão</h3>
                  </div>
                </div>
                <div className="rhythm-list">
                  {data.governance.operatingRhythm.map((item, index) => (
                    <div key={item.cadence}>
                      <span className="rhythm-step">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <small>{item.cadence}</small>
                        <strong>{item.ritual}</strong>
                      </span>
                      <span>
                        <small>Responsável</small>
                        <strong>{item.owner}</strong>
                      </span>
                      <p>{item.evidence}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel approval-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Controles</span>
                    <h3>Regras de aprovação</h3>
                  </div>
                </div>
                <ol>
                  {data.governance.approvalRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ol>
              </article>
            </div>

            <article className="panel access-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Segregação de funções</span>
                  <h3>Matriz de acesso recomendada</h3>
                </div>
                <span>Princípio do menor privilégio</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table access-table">
                  <thead>
                    <tr>
                      <th>Perfil</th>
                      <th>Visualizar</th>
                      <th>Editar</th>
                      <th>Aprovar</th>
                      <th>Gerir usuários</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.governance.roles.map((role) => (
                      <tr key={role.role}>
                        <td><strong>{role.role}</strong></td>
                        {[role.view, role.edit, role.approve, role.manageUsers].map(
                          (allowed, index) => (
                            <td key={`${role.role}-${index}`}>
                              <span className={allowed ? "access-yes" : "access-no"}>
                                {allowed ? "Permitido" : "Bloqueado"}
                              </span>
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel quality-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Qualidade da informação</span>
                  <h3>Backlog de saneamento identificado na planilha</h3>
                </div>
                <span>{data.dataQualityIssues.length} itens</span>
              </div>
              <div className="quality-grid">
                {data.dataQualityIssues.map((issue) => (
                  <div key={issue.title}>
                    <span className={`severity-label ${issue.severity}`}>
                      {issue.severity}
                    </span>
                    <small>{issue.category}</small>
                    <strong>{issue.title}</strong>
                    <p>{issue.description}</p>
                    <b>Responsável: {issue.owner}</b>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}

        {section === "dados" && currentSheet && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Data room comercial</span>
                <h2>Todos os dados da planilha, sem perda de contexto.</h2>
                <p>
                  As 20 abas, {data.meta.importedCells.toLocaleString("pt-BR")}{" "}
                  células preenchidas e {data.meta.formulaCells} fórmulas estão
                  disponíveis para consulta e auditoria.
                </p>
              </div>
              <div className="source-stamp">
                <span>Fonte original</span>
                <strong>{data.meta.sourceFile}</strong>
              </div>
            </div>

            <div className="data-room">
              <aside className="sheet-list">
                <div>
                  <span>Abas do arquivo</span>
                  <strong>{data.rawSheets.length}</strong>
                </div>
                {data.rawSheets.map((sheet) => (
                  <button
                    type="button"
                    key={sheet.name}
                    className={sheet.name === currentSheet.name ? "active" : ""}
                    onClick={() => {
                      setSelectedSheet(sheet.name);
                      setSheetSearch("");
                    }}
                  >
                    <span>{sheet.name}</span>
                    <small>{sheet.rowCount} × {sheet.columnCount}</small>
                  </button>
                ))}
              </aside>

              <article className="panel sheet-panel">
                <div className="sheet-toolbar">
                  <div>
                    <span className="section-kicker">Aba selecionada</span>
                    <h3>{currentSheet.name}</h3>
                  </div>
                  <label className="sheet-search">
                    <span>Buscar nesta aba</span>
                    <input
                      value={sheetSearch}
                      onChange={(event) => setSheetSearch(event.target.value)}
                      placeholder="Digite um valor"
                    />
                  </label>
                  <div className="mode-toggle">
                    <button
                      type="button"
                      className={sheetMode === "values" ? "active" : ""}
                      onClick={() => setSheetMode("values")}
                    >
                      Valores
                    </button>
                    <button
                      type="button"
                      className={sheetMode === "formulas" ? "active" : ""}
                      onClick={() => setSheetMode("formulas")}
                    >
                      Fórmulas
                    </button>
                  </div>
                </div>
                <div className="sheet-meta">
                  <span>{currentSheet.rowCount} linhas</span>
                  <span>{currentSheet.columnCount} colunas</span>
                  <span>{currentSheet.nonEmptyCells} células</span>
                  <span>{currentSheet.formulaCells} fórmulas</span>
                </div>
                <div className="spreadsheet-wrap">
                  <table className="spreadsheet">
                    <thead>
                      <tr>
                        <th>#</th>
                        {Array.from(
                          { length: currentSheet.columnCount },
                          (_, index) => (
                            <th key={index}>
                              {String.fromCharCode(65 + (index % 26))}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSheetRows.map(({ row, rowNumber }) => (
                        <tr key={rowNumber}>
                          <th>{rowNumber}</th>
                          {Array.from(
                            { length: currentSheet.columnCount },
                            (_, index) => (
                              <td key={index}>{String(row[index] ?? "")}</td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          </section>
        )}

        <footer className="app-footer">
          <span>
            Atlas Comercial 360 · Base importada em{" "}
            {new Date(data.meta.generatedAt).toLocaleDateString("pt-BR")}
          </span>
          <span>Segurança · Governança · Previsibilidade</span>
        </footer>
      </main>
    </div>
  );
}
