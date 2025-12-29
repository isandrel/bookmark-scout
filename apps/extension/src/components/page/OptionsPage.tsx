/**
 * OptionsPage - Settings page using react-hook-form and zod validation.
 * Provides UI for configuring all extension settings.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Download, Moon, RotateCcw, Save, Sun, Upload } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import {
  type Settings,
  settingsSchema,
  settingsCategories,
  settingsFieldMeta,
} from '@/lib/settings-schema';
import {
  useSettings,
  exportSettings,
  importSettings,
} from '@/lib/settings-storage';

const OptionsPage: React.FC = () => {
  const { settings, isLoading, updateSettings, resetToDefaults } = useSettings();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<Settings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
  });

  // Update form when settings load
  useEffect(() => {
    if (!isLoading) {
      form.reset(settings);
    }
  }, [settings, isLoading, form]);

  const onSubmit = async (data: Settings) => {
    setIsSaving(true);
    try {
      await updateSettings(data);
      // Sync theme with theme provider
      if (data.theme !== theme) {
        setTheme(data.theme);
      }
      toast({
        title: '✓ Settings saved',
        description: 'Your preferences have been updated.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: '× Error saving settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      await resetToDefaults();
      form.reset();
      toast({
        title: '✓ Settings reset',
        description: 'All settings have been restored to defaults.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: '× Error resetting settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportSettings();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bookmark-scout-settings.json';
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: '✓ Settings exported',
        description: 'Settings file has been downloaded.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: '× Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      await importSettings(text);
      toast({
        title: '✓ Settings imported',
        description: 'Your settings have been restored from file.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: '× Import failed',
        description: error instanceof Error ? error.message : 'Invalid settings file',
        variant: 'destructive',
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderField = (fieldKey: keyof Settings) => {
    const meta = settingsFieldMeta[fieldKey];

    switch (meta.type) {
      case 'switch':
        return (
          <Switch
            checked={form.watch(fieldKey) as boolean}
            onCheckedChange={(checked) => form.setValue(fieldKey, checked as Settings[typeof fieldKey])}
          />
        );

      case 'select':
        return (
          <Select
            value={String(form.watch(fieldKey))}
            onValueChange={(value) => {
              // Convert to number if options have numeric values
              const numValue = Number(value);
              const finalValue = Number.isNaN(numValue) ? value : numValue;
              form.setValue(fieldKey, finalValue as Settings[typeof fieldKey]);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meta.options?.map((option) => (
                <SelectItem key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'number':
        return (
          <div className="flex items-center gap-3 w-[200px]">
            <Slider
              value={[form.watch(fieldKey) as number]}
              onValueChange={([value]) => form.setValue(fieldKey, value as Settings[typeof fieldKey])}
              min={meta.min}
              max={meta.max}
              step={meta.step}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-16 text-right">
              {form.watch(fieldKey)}{meta.unit}
            </span>
          </div>
        );

      case 'text':
        return (
          <Input
            {...form.register(fieldKey)}
            className="w-[200px]"
            placeholder={meta.label}
          />
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto p-6 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card className="border-none shadow-lg">
              <CardHeader className="space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl font-bold">Bookmark Scout Settings</CardTitle>
                    <CardDescription>Customize your bookmark management experience</CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  >
                    {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-8">
                {Object.entries(settingsCategories).map(([categoryKey, category], index) => (
                  <motion.div
                    key={categoryKey}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <h3 className="text-lg font-semibold mb-1">{category.label}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{category.description}</p>
                    <div className="space-y-4">
                      {category.fields.map((fieldKey) => {
                        const meta = settingsFieldMeta[fieldKey];
                        const error = form.formState.errors[fieldKey];
                        return (
                          <motion.div
                            key={fieldKey}
                            whileHover={{ scale: 1.01 }}
                            className="flex items-start justify-between p-4 rounded-lg bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div className="space-y-1 flex-1">
                              <Label htmlFor={fieldKey} className="text-base">
                                {meta.label}
                              </Label>
                              <p className="text-sm text-muted-foreground">{meta.description}</p>
                              {error && (
                                <p className="text-sm text-destructive">{error.message}</p>
                              )}
                            </div>
                            {renderField(fieldKey)}
                          </motion.div>
                        );
                      })}
                    </div>
                    {index < Object.keys(settingsCategories).length - 1 && (
                      <Separator className="my-6" />
                    )}
                  </motion.div>
                ))}

                {/* Action Buttons */}
                <div className="pt-6 flex flex-wrap gap-3 justify-between">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleExport}>
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleImport}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReset}
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </form>
        </motion.div>
      </div>
      <Toaster />
    </div>
  );
};

export default OptionsPage;
