import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface Breadcrumb {
  label: string;
  to?: string;
}

interface BreadcrumbContextValue {
  breadcrumbs: Breadcrumb[];
  setBreadcrumbs: (crumbs: Breadcrumb[]) => void;
  clearBreadcrumbs: () => void;
  toolbar: ReactNode | null;
  setToolbar: (node: ReactNode | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  breadcrumbs: [],
  setBreadcrumbs: () => {},
  clearBreadcrumbs: () => {},
  toolbar: null,
  setToolbar: () => {},
});

export const BreadcrumbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [breadcrumbs, setBreadcrumbsState] = useState<Breadcrumb[]>([]);
  const [toolbar, setToolbarState] = useState<ReactNode | null>(null);

  const setBreadcrumbs = useCallback((crumbs: Breadcrumb[]) => {
    setBreadcrumbsState(crumbs);
  }, []);

  const clearBreadcrumbs = useCallback(() => {
    setBreadcrumbsState([]);
  }, []);

  const setToolbar = useCallback((node: ReactNode | null) => {
    setToolbarState(node);
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ breadcrumbs, setBreadcrumbs, clearBreadcrumbs, toolbar, setToolbar }}>
      {children}
    </BreadcrumbContext.Provider>
  );
};

export const useBreadcrumbs = () => useContext(BreadcrumbContext);
