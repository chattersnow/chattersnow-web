"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type WorkflowInfoCardProps = {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function WorkflowInfoCard({
  title,
  defaultOpen = true,
  children,
}: WorkflowInfoCardProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{title}</CardTitle>
          <CollapsibleTrigger
            render={<Button type="button" variant="ghost" size="sm" />}
            className="group/workflow-info-trigger"
          >
            <ChevronDown className="transition-transform group-data-panel-open/workflow-info-trigger:rotate-180" />
            <span className="group-data-panel-open/workflow-info-trigger:hidden">
              Show
            </span>
            <span className="hidden group-data-panel-open/workflow-info-trigger:inline">
              Hide
            </span>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="app-muted text-sm">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
