import Icon, { type IconName } from "./Icon";

export type ViewKey = "library" | "import" | "settings";

type AppNavigationProps = {
  activeView: ViewKey | "quiz" | "summary";
  onNavigate: (view: ViewKey) => void;
};

const items: Array<{ key: ViewKey; label: string; icon: IconName }> = [
  { key: "library", label: "Library", icon: "book" },
  { key: "import", label: "Add quiz", icon: "upload" },
  { key: "settings", label: "AI settings", icon: "key" },
];

export default function AppNavigation({
  activeView,
  onNavigate,
}: AppNavigationProps) {
  return (
    <nav className="app-navigation" aria-label="Main navigation">
      {items.map((item) => (
        <button
          aria-current={activeView === item.key ? "page" : undefined}
          className={activeView === item.key ? "active" : undefined}
          key={item.key}
          onClick={() => onNavigate(item.key)}
          type="button"
        >
          <Icon name={item.icon} size={16} />
          {item.label}
        </button>
      ))}
    </nav>
  );
}
