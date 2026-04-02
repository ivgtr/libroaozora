import { generateThemeScript } from "@/lib/theme";

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: generateThemeScript() }} />;
}
