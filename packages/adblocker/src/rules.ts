export type Category = "ads" | "home" | "inGame" | "multiplayer";

export interface Rule {
  selector: string;
  category: Category;
  url_paths?: string[];
}

export interface AncestorRule {
  selector: string;
  ancestor: string;
  category: Category;
}

export interface StructuralRule {
  source: string;
  target: string;
  reverseOrder: boolean;
  category: Category;
}

export interface InsertRule {
  selector: string;
  url_paths?: string[];
  category: Category;
  insertId: string;
  position: InsertPosition;
  html: string;
}

export const DIRECT_BLOCK_CONFIG: Rule[] = [
  { selector: '[class*="team-matchmaking-layout_footer__"]', category: "multiplayer" },
  { selector: '[class*="ranked-matchmaking-layout_footer__"]', category: "multiplayer" },
  { selector: '[class*="unranked-matchmaking-layout_footer__"]', category: "multiplayer" },
  { selector: '[class*="styles_friendChatButton__"]', category: "inGame" },
  { selector: '[class*="styles_controlGroup__"]', category: "inGame" },
  { selector: '[class*="live-players-count_container__"]', category: "inGame" },
  { selector: '[class*="footer_footer__"]', category: "home", url_paths: ["/"] },
  { selector: '[class*="footer_root__"]', category: "multiplayer", url_paths: ["/multiplayer"] },
  { selector: '[class*="pro-user-start-page_editButtonWrapper__"]', category: "home" },
  { selector: 'iframe[name="__tcfapiLocator"]', category: "ads" },
  { selector: 'iframe[name="__uspapiLocator"]', category: "ads" },
  { selector: 'iframe[name="__adconsentLocator"]', category: "ads" },
  { selector: 'iframe[name="googlefcPresent"]', category: "ads" },
  { selector: 'iframe[src*="criteo.com"]', category: "ads" },
  { selector: "#confiant_tag_holder", category: "ads" },
  { selector: ".snigel-adhesive", category: "ads" },
  { selector: "#adconsent-usp-banner-btn", category: "ads" },
];

export const CSS_HIDING_SELECTORS: Rule[] = [
  { selector: '[class*="pro-user-start-page_left__"]', category: "home" },
  { selector: '.gmnoprint:not([class*="sv-links-control"])', category: "inGame" },
];

export const ANCESTOR_BLOCK_CONFIG: AncestorRule[] = [
  {
    selector: '[class*="clubs-widget_promo"]',
    ancestor: '[class*="widget_root"]',
    category: "home",
  },
  {
    selector: '[class*="widget_explorer__"]',
    ancestor: '[class*="profile-v2_widgetRow__"]',
    category: "home",
  },
];

export const STRUCTURAL_MAPPINGS: StructuralRule[] = [
  {
    source: '[class*="styles_columnTwo__"]',
    target: '[class*="styles_columnOne__"]',
    reverseOrder: true,
    category: "inGame",
  },
];

export const HTML_INSERTS: InsertRule[] = [
  {
    selector: '[class*="pro-user-start-page_center__"]',
    url_paths: ["/"],
    category: "home",
    insertId: "ggb-insert-links",
    position: "beforeend",
    html: `
      <div id="ggb-insert-links" style="display:flex;flex-direction:row;gap:1rem;margin-top:1rem;">
        <a href="/multiplayer" title="Solo duels" style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:1rem;background:rgba(121,82,233,.35);color:#fff;font:800 12px/1 var(--default-font,sans-serif);text-decoration:none;">1v1</a>
        <a href="/multiplayer/teams" title="Team duels" style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:1rem;background:rgba(121,82,233,.35);color:#fff;font:800 10px/1 var(--default-font,sans-serif);text-decoration:none;">TEAM</a>
      </div>
    `,
  },
];
