import { useContext, useId } from "react";
import { AppearanceContext, type Appearance } from "./appearance-context-value";
export function AppearanceControl() {
  const context = useContext(AppearanceContext);
  const id = useId();
  if (!context) return null;
  return (
    <label className="appearance-control" htmlFor={id}>
      <span>Appearance</span>
      <select
        id={id}
        value={context.appearance}
        onChange={(event) => context.setAppearance(event.target.value as Appearance)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
