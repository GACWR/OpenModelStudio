"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/providers/auth-provider";
import { ApolloWrapper } from "@/providers/apollo-provider";
import { SidebarProvider } from "@/providers/sidebar-provider";
import { SearchProvider } from "@/components/shared/search-overlay";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApolloWrapper>
      <AuthProvider>
        <SidebarProvider>
          <TooltipProvider>
            <SearchProvider>{children}</SearchProvider>
          </TooltipProvider>
        </SidebarProvider>
      </AuthProvider>
    </ApolloWrapper>
  );
}
