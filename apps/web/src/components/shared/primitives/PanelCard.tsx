import React from "react"
import { Card, CardContent } from "@mui/material"

interface PanelCardProps {
  children: React.ReactNode
}

export function PanelCard({ children }: PanelCardProps) {
  return (
    <Card>
      <CardContent sx={{ pb: "12px !important" }}>
        {children}
      </CardContent>
    </Card>
  )
}