"use client";

/**
 * Settings Page
 *
 * @description Workspace configuration and preferences.
 */

import { useState } from "react";
import { Settings, Save, Shield, Bell, Wallet, Users, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

/**
 * Settings Page.
 */
export default function SettingsPage() {
  const [saving, setSaving] = useState(false);

  // Auto-pay settings
  const [autoPayEnabled, setAutoPayEnabled] = useState(true);
  const [maxPerStep, setMaxPerStep] = useState([1]); // $1 USDC
  const [maxPerRun, setMaxPerRun] = useState([10]); // $10 USDC

  // Notification settings
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [notifyOnApproval, setNotifyOnApproval] = useState(true);
  const [notifyOnFail, setNotifyOnFail] = useState(true);

  // Handle save
  const handleSave = async () => {
    setSaving(true);
    try {
      // In production, save to API
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success("Settings saved successfully!");
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">
            Configure your workspace preferences and policies
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-cyan-accent to-primary hover:opacity-90"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="payments" className="space-y-6">
        <TabsList>
          <TabsTrigger value="payments" className="gap-2">
            <Wallet className="w-4 h-4" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="w-4 h-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Users className="w-4 h-4" />
            Team
          </TabsTrigger>
        </TabsList>

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Payment Settings</CardTitle>
              <CardDescription>
                Configure automatic payment approvals and budget limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Auto-pay toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Auto-pay Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically approve payments within configured limits
                  </p>
                </div>
                <Switch
                  checked={autoPayEnabled}
                  onCheckedChange={setAutoPayEnabled}
                />
              </div>

              <Separator />

              {/* Max per step */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Max Payment per Step</Label>
                    <p className="text-sm text-muted-foreground">
                      Payments above this amount require approval
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-payment">
                    ${maxPerStep[0].toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={maxPerStep}
                  onValueChange={setMaxPerStep}
                  max={10}
                  min={0.1}
                  step={0.1}
                  disabled={!autoPayEnabled}
                />
              </div>

              {/* Max per run */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Max Budget per Run</Label>
                    <p className="text-sm text-muted-foreground">
                      Default maximum spending for each workflow run
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-payment">
                    ${maxPerRun[0].toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={maxPerRun}
                  onValueChange={setMaxPerRun}
                  max={100}
                  min={1}
                  step={1}
                  disabled={!autoPayEnabled}
                />
              </div>

              <Separator />

              {/* Network info */}
              <div className="p-4 rounded-lg bg-muted/50">
                <Label className="text-muted-foreground">Payment Network</Label>
                <p className="text-sm font-medium mt-1">
                  Base Sepolia (Testnet) - USDC
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  All payments use test USDC on the Base Sepolia network
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose what events you want to be notified about
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Run Completed</Label>
                  <p className="text-sm text-muted-foreground">
                    Notify when a workflow run completes
                  </p>
                </div>
                <Switch
                  checked={notifyOnComplete}
                  onCheckedChange={setNotifyOnComplete}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Approval Required</Label>
                  <p className="text-sm text-muted-foreground">
                    Notify when a payment needs approval
                  </p>
                </div>
                <Switch
                  checked={notifyOnApproval}
                  onCheckedChange={setNotifyOnApproval}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Run Failed</Label>
                  <p className="text-sm text-muted-foreground">
                    Notify when a workflow run fails
                  </p>
                </div>
                <Switch
                  checked={notifyOnFail}
                  onCheckedChange={setNotifyOnFail}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Configure security policies and API access
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label>Tool Allowlist</Label>
                <p className="text-sm text-muted-foreground">
                  Only allow tools from these domains (one per line)
                </p>
                <textarea
                  className="w-full h-32 p-3 rounded-lg bg-background border border-input font-mono text-sm"
                  placeholder="api.example.com&#10;trusted-service.io"
                />
              </div>

              <Separator />

              <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2 text-success">
                  <Shield className="w-5 h-5" />
                  <Label className="text-success">SSRF Protection</Label>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Automatic protection against Server-Side Request Forgery
                  attacks is enabled for all tool calls.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage who has access to this workspace
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {/* Mock team members */}
                {[
                  { name: "You", email: "you@example.com", role: "Owner" },
                ].map((member, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-accent to-primary" />
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>

              <Button variant="outline" className="w-full">
                <Users className="w-4 h-4 mr-2" />
                Invite Team Member
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
