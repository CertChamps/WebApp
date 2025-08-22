declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElement>, MathfieldElement>;
    }
  }
}

declare module 'nerdamer' {
  interface NerdamerStatic {
    (expression: string, ...args: any[]): NerdamerInstance;
    text(): string;
    evaluate(): NerdamerInstance;
    expand(): NerdamerInstance;
    simplify(): NerdamerInstance;
    diff(variable: string): NerdamerInstance;
    integrate(variable: string): NerdamerInstance;
    solveFor(variable: string): NerdamerInstance;
    
    // New methods
    convertFromLaTeX(tex: string): NerdamerInstance;
  }

  interface NerdamerInstance {
    text(): string;
    eq(other: string | NerdamerInstance): boolean;
    expand(): NerdamerInstance;
    simplify(): NerdamerInstance;
    diff(variable: string): NerdamerInstance;
    integrate(variable: string): NerdamerInstance;
    solveFor(variable: string): NerdamerInstance;
  }

  const nerdamer: NerdamerStatic;
  export = nerdamer;
}


export {};