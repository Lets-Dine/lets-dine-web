import { Fragment, type ReactNode } from 'react';

const MARK = 'FeastoX';

/** The product name. The X takes the brand colour; the rest inherits. */
export function BrandName() {
  return (
    <>
      Feasto<span className="text-flame-3">X</span>
    </>
  );
}

/** Same mark inside a sentence. Text with no mark is returned unchanged. */
export function paintBrand(text: string): ReactNode {
  if (!text.includes(MARK)) return text;
  return text.split(MARK).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <BrandName />}
      {part}
    </Fragment>
  ));
}
