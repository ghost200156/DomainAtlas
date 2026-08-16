import { type CSSProperties } from "react";

import type { AtlasDocument, ConceptNode as ConceptNodeData, DemoRun } from "../../lib/types";

import { cleanLabel } from "../../lib/atlas/labels";

function GuardianGlyph({ variant, color, phase }: { variant: number; color: string; phase: number }) {
  const style = {
    "--guardian-color": color,
    "--guardian-delay": `${-(phase % 7) * 0.63}s`,
  } as CSSProperties;

  if (variant === 0) {
    return (
      <g className="node-guardian guardian-moth" style={style}>
        <path className="guardian-wing guardian-wing-left" d="M80 51C70 30 51 28 54 45C56 59 68 66 81 57Z" />
        <path className="guardian-wing guardian-wing-right" d="M90 51C100 30 119 28 116 45C114 59 102 66 89 57Z" />
        <ellipse className="guardian-body" cx="85" cy="52" rx="6" ry="18" />
        <circle className="guardian-head" cx="85" cy="33" r="6" />
        <path className="guardian-line" d="M82 29C77 22 72 23 70 18M88 29C93 22 98 23 100 18" />
      </g>
    );
  }
  if (variant === 1) {
    return (
      <g className="node-guardian guardian-fox" style={style}>
        <path className="guardian-tail" d="M101 62C124 68 127 45 111 44C102 44 102 53 110 54" />
        <ellipse className="guardian-body" cx="87" cy="59" rx="23" ry="14" />
        <circle className="guardian-head" cx="68" cy="43" r="14" />
        <path className="guardian-body" d="M57 34L59 20L68 31L78 20L80 36Z" />
        <circle className="guardian-eye" cx="64" cy="42" r="2" />
        <circle className="guardian-eye" cx="72" cy="42" r="2" />
      </g>
    );
  }
  if (variant === 2) {
    return (
      <g className="node-guardian guardian-jelly" style={style}>
        <path className="guardian-body" d="M59 53C59 31 70 21 85 21C100 21 111 31 111 53C98 59 72 59 59 53Z" />
        <circle className="guardian-eye" cx="77" cy="42" r="2.4" />
        <circle className="guardian-eye" cx="93" cy="42" r="2.4" />
        <path className="guardian-line guardian-tentacles" d="M68 55C64 65 72 68 68 78M80 57C76 68 84 70 80 82M92 57C88 68 96 70 92 82M103 55C99 64 106 68 102 77" />
      </g>
    );
  }
  if (variant === 3) {
    return (
      <g className="node-guardian guardian-owl" style={style}>
        <ellipse className="guardian-body" cx="85" cy="53" rx="24" ry="29" />
        <path className="guardian-wing guardian-wing-left" d="M65 45C50 50 52 66 70 69Z" />
        <path className="guardian-wing guardian-wing-right" d="M105 45C120 50 118 66 100 69Z" />
        <circle className="guardian-face" cx="76" cy="43" r="9" />
        <circle className="guardian-face" cx="94" cy="43" r="9" />
        <circle className="guardian-eye" cx="76" cy="43" r="3" />
        <circle className="guardian-eye" cx="94" cy="43" r="3" />
        <path className="guardian-beak" d="M82 49L85 55L88 49Z" />
      </g>
    );
  }
  return (
    <g className="node-guardian guardian-deer" style={style}>
      <ellipse className="guardian-body" cx="83" cy="60" rx="25" ry="14" />
      <path className="guardian-line guardian-legs" d="M69 69L66 82M91 70L94 82" />
      <path className="guardian-neck" d="M98 59C98 47 101 40 107 36" />
      <ellipse className="guardian-head" cx="108" cy="33" rx="10" ry="8" />
      <path className="guardian-line guardian-antlers" d="M105 27L100 18M101 23L95 21M111 27L116 18M115 23L121 21" />
      <circle className="guardian-eye" cx="111" cy="32" r="1.8" />
    </g>
  );
}

type ConceptNodeProps = {
  atlas: AtlasDocument;
  concept: ConceptNodeData;
  conceptOrder: number;
  isDimmed: boolean;
  isOpened: boolean;
  isSelected: boolean;
  moduleColor: string;
  position: { x: number; y: number };
  progress: DemoRun["progress"];
  relationCount: number;
  isFrontier: boolean;
  onHover: (conceptId: string) => void;
  onSelect: (conceptId: string) => void;
};

export function ConceptNode({
  atlas,
  concept,
  conceptOrder,
  isDimmed,
  isFrontier,
  isOpened,
  isSelected,
  moduleColor,
  onHover,
  onSelect,
  position,
  progress,
  relationCount,
}: ConceptNodeProps) {
  const accessibleName = `${cleanLabel(concept.name)} ${relationCount} 条知识路径`;
  return (
    <g
      aria-label={accessibleName}
      className={`explorer-node ${concept.id === (atlas.concepts[0]?.id) ? "root-node" : ""} ${isFrontier ? "frontier" : ""} ${isSelected ? "selected" : ""} ${isDimmed ? "dimmed" : ""} ${progress[concept.id] === "understood" ? "understood" : ""}`}
      key={concept.id}
      onClick={() => onSelect(concept.id)}
      onMouseEnter={() => onHover(concept.id)}
      onMouseLeave={() => onHover("")}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(concept.id);
        }
      }}
      role="button"
      tabIndex={0}
      transform={`translate(${position.x} ${position.y})`}
    >
      <ellipse className="node-aura" cx="85" cy="53" rx="54" ry="46" stroke={moduleColor} />
      <GuardianGlyph variant={(conceptOrder - 1) % 5} color={moduleColor} phase={conceptOrder} />
      {!isOpened ? (
        <circle className="node-state" cx="123" cy="23" r="6" fill={progress[concept.id] === "understood" ? "#278e73" : moduleColor} />
      ) : null}
      <text className="node-label" x="85" y="122">{cleanLabel(concept.name)}</text>
      <text className="node-relations" x="85" y="142">{isFrontier ? "待探索" : `${relationCount} 条知识关联`}</text>
    </g>
  );
}
