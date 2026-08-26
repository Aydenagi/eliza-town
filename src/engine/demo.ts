export interface DemoTaskTemplate {
  title: string;
  description: string;
}

export const DEMO_TASK_TEMPLATES: DemoTaskTemplate[] = [
  { title: 'Build a pomodoro timer', description: 'A single-page pomodoro timer with start, pause, and reset.' },
  { title: 'Build a color palette generator', description: 'Generate and preview random color palettes with hex codes.' },
  { title: 'Build a markdown previewer', description: 'A page with a textarea that renders markdown live below it.' },
  { title: 'Build a tip calculator', description: 'Enter a bill total and tip percent, show the split per person.' },
  { title: 'Build a random quote generator', description: 'Show a random quote from a small built-in list on each click.' },
  { title: 'Build a unit converter', description: 'Convert between common units of length and weight.' },
];

export function randomDemoTask(): DemoTaskTemplate {
  return DEMO_TASK_TEMPLATES[Math.floor(Math.random() * DEMO_TASK_TEMPLATES.length)];
}
