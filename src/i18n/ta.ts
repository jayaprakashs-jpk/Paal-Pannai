import p1 from './ta/p1.json';
import p2 from './ta/p2.json';
import p3 from './ta/p3.json';
import p4 from './ta/p4.json';
import p5 from './ta/p5.json';

/** English text -> Tamil. Add new strings to the newest part file; `npm run i18n:check` lists what is missing. */
export const TA: Record<string, string> = { ...p1, ...p2, ...p3, ...p4, ...p5 };
