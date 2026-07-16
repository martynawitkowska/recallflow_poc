export type ViewKey = "library" | "import" | "settings";

type AppNavigationProps = {
  activeView: ViewKey;
  onNavigate: (view: ViewKey) => void;
};

const items: Array<{ key: ViewKey; label: string }> = [
  { key: "library", label: "Library" },
  { key: "import", label: "Add quiz" },
  { key: "settings", label: "AI settings" },
];

export default function AppNavigation({
  activeView,
  onNavigate,
}: AppNavigationProps) {
  return (
    <nav aria-label="Main navigation">
      {items.map((item) => (
        <button
          aria-current={activeView === item.key ? "page" : undefined}
          className={activeView === item.key ? "active" : undefined}
          key={item.key}
          onClick={() => onNavigate(item.key)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
