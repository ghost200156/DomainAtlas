import { Link } from "react-router";

const ROUTE_STAGES = [
  { index: "01", title: "校准目标", agent: "Planning Agent" },
  { index: "02", title: "检索证据", agent: "Research Agent" },
  { index: "03", title: "绘制地图", agent: "Atlas Agent" },
];

export function meta() {
  return [
    { title: "DomainAtlas · 把陌生领域变成可探索的地图" },
    { name: "description", content: "三 Agent 驱动的领域学习地图 Demo" },
  ];
}

export default function Home() {
  return (
    <main>
      <section className="hero page-width">
        <div className="hero-copy">
          <p className="eyebrow">FIELD LEARNING SYSTEM · DEMO 01</p>
          <h1>别再读一堆资料。<br />先看清这片领域。</h1>
          <p className="hero-lead">
            给出一个陌生主题，DomainAtlas 会先和你确认路线，再把证据、概念和关系整理成一张可以探索的学习地图。
          </p>
          <div className="hero-actions">
            <Link to="/new" className="button button-primary">开始一次测绘 <span>→</span></Link>
            <a href="#route" className="text-link">看看 Agent 怎样协作</a>
          </div>
        </div>
        <div className="field-card" aria-label="示例领域地图">
          <div className="field-card-top">
            <span>ATLAS PREVIEW</span><span>31°14′N</span>
          </div>
          <div className="contour contour-one" />
          <div className="contour contour-two" />
          <div className="map-node node-a"><i />目标边界</div>
          <div className="map-node node-b"><i />领域模型</div>
          <div className="map-node node-c accent"><i />流程编排</div>
          <div className="map-node node-d"><i />质量评估</div>
          <svg className="preview-lines" viewBox="0 0 520 420" aria-hidden="true">
            <path d="M105 95 C190 105 190 155 270 170 S390 210 410 320" />
            <path d="M270 170 C260 245 190 265 135 315" />
          </svg>
          <div className="map-scale">0 ━━━ 50 MIN</div>
        </div>
      </section>

      <section className="route-section" id="route">
        <div className="page-width">
          <div className="section-heading">
            <div><p className="eyebrow">THE FIELD ROUTE</p><h2>一条看得见的 Agent 路线</h2></div>
            <p>三个 Agent 各做一件事。确定性问题交给程序校验，用户在关键分岔口做决定。</p>
          </div>
          <div className="route-grid">
            {ROUTE_STAGES.map((stage) => (
              <article className="route-stage" key={stage.index}>
                <div className="route-number">{stage.index}</div>
                <div className="route-pin" />
                <p className="route-agent">{stage.agent}</p>
                <h3>{stage.title}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="principle page-width">
        <p className="eyebrow">DESIGN PRINCIPLE</p>
        <blockquote>“Demo 不需要模拟完整产品，<br />但必须把最核心的判断过程讲清楚。”</blockquote>
        <div className="principle-notes">
          <span>固定研究资料 · 可稳定演示</span>
          <span>结构化结果 · 可以继续扩展</span>
        </div>
      </section>
    </main>
  );
}
