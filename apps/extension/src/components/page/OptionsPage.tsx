/**
 * OptionsPage - Settings page with multi-tab interface.
 * Uses react-hook-form and zod validation.
 * Designed to scale for many options with categorized tabs.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Eye,
  EyeOff,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sliders,
  Sparkles,
  Sun,
  Upload,
} from 'lucide-react';
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
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/toaster';
import { t } from '@/hooks/use-i18n';
import { useToast } from '@/hooks/use-toast';
import {
  type Settings,
  settingsSchema,
  getSettingsCategories,
  getSettingsFieldMeta,
} from '@/lib/settings-schema';
import { useSettings, exportSettings, importSettings } from '@/lib/settings-storage';
import { getModelsForProvider, type AIProvider } from '@/services';

// Tab icons mapping
const tabIcons: Record<string, React.ReactNode> = {
  appearance: <Palette className="h-4 w-4" />,
  search: <Search className="h-4 w-4" />,
  behavior: <Settings2 className="h-4 w-4" />,
  advanced: <Sliders className="h-4 w-4" />,
  ai: <Sparkles className="h-4 w-4" />,
};

const OptionsPage: React.FC = () => {
  const { settings, isLoading, updateSettings, resetToDefaults } = useSettings();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('appearance');
  const [searchQuery, setSearchQuery] = useState('');
  
  // API Key state (stored separately for security)
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');

  const form = useForm<Settings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
  });

  // Load API key from storage
  useEffect(() => {
    chrome.storage.local.get('aiApiKey').then(({ aiApiKey }) => {
      if (aiApiKey) setApiKey(aiApiKey);
    });
  }, []);

  // Validate and save API key
  const saveApiKey = async (key: string) => {
    setApiKeyError('');
    
    if (!key.trim()) {
      await chrome.storage.local.remove('aiApiKey');
      setApiKey('');
      return;
    }

    // Basic format validation
    const provider = form.watch('aiProvider');
    if (provider === 'openai' && !key.startsWith('sk-')) {
      setApiKeyError('OpenAI keys start with sk-');
      return;
    }
    if (provider === 'anthropic' && !key.startsWith('sk-ant-')) {
      setApiKeyError('Anthropic keys start with sk-ant-');
      return;
    }
    
    await chrome.storage.local.set({ aiApiKey: key });
    setApiKey(key);
    toast({
      title: '✓ API Key Saved',
      description: 'Your API key has been saved securely.',
      variant: 'success',
    });
  };

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
      if (data.theme !== theme) {
        setTheme(data.theme);
      }
      toast({
        title: `✓ ${t('settingsSaved')}`,
        description: t('preferencesUpdated'),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: `× ${t('errorSavingSettings')}`,
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
        title: `✓ ${t('settingsReset')}`,
        description: t('settingsResetDescription'),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: `× ${t('errorResettingSettings')}`,
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
        title: `✓ ${t('settingsExported')}`,
        description: t('settingsExportedDescription'),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: `× ${t('exportFailed')}`,
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
        title: `✓ ${t('settingsImported')}`,
        description: t('settingsImportedDescription'),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: `× ${t('importFailed')}`,
        description: error instanceof Error ? error.message : t('invalidSettingsFile'),
        variant: 'destructive',
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Filter settings by search query
  const filterFields = (fields: readonly (keyof Settings)[]) => {
    if (!searchQuery) return fields;
    return fields.filter((fieldKey) => {
      const meta = getSettingsFieldMeta()[fieldKey];
      return (
        meta.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        meta.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  };

  const renderField = (fieldKey: keyof Settings) => {
    const meta = getSettingsFieldMeta()[fieldKey];

    switch (meta.type) {
      case 'switch':
        return (
          <Switch
            checked={form.watch(fieldKey) as boolean}
            onCheckedChange={(checked) =>
              form.setValue(fieldKey, checked as Settings[typeof fieldKey])
            }
          />
        );

      case 'select': {
        // For aiModel, use dynamic options based on selected provider
        let selectOptions = meta.options;
        if (fieldKey === 'aiModel') {
          const provider = form.watch('aiProvider') as AIProvider;
          const models = getModelsForProvider(provider);
          selectOptions = models.map(m => ({ value: m.id, label: m.name }));
        }
        
        return (
          <Select
            value={String(form.watch(fieldKey))}
            onValueChange={(value) => {
              const numValue = Number(value);
              const finalValue = Number.isNaN(numValue) ? value : numValue;
              form.setValue(fieldKey, finalValue as Settings[typeof fieldKey]);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectOptions?.map((option) => (
                <SelectItem key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case 'number':
        return (
          <div className="flex items-center gap-3 w-[200px]">
            <Slider
              value={[form.watch(fieldKey) as number]}
              onValueChange={([value]) =>
                form.setValue(fieldKey, value as Settings[typeof fieldKey])
              }
              min={meta.min}
              max={meta.max}
              step={meta.step}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-16 text-right">
              {form.watch(fieldKey)}
              {meta.unit}
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

  const renderSettingsField = (fieldKey: keyof Settings) => {
    const meta = getSettingsFieldMeta()[fieldKey];
    const error = form.formState.errors[fieldKey];

    return (
      <motion.div
        key={fieldKey}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        whileHover={{ scale: 1.01 }}
        className="flex items-start justify-between p-4 rounded-lg bg-card hover:bg-accent/50 transition-colors border border-transparent hover:border-border"
      >
        <div className="space-y-1 flex-1 pr-4">
          <Label htmlFor={fieldKey} className="text-base font-medium">
            {meta.label}
          </Label>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
          {error && <p className="text-sm text-destructive">{error.message}</p>}
        </div>
        {renderField(fieldKey)}
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <div className="text-muted-foreground">{t('loadingSettings')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto p-6 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card className="border-none shadow-lg">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl font-bold">{t('settings')}</CardTitle>
                    <CardDescription>{t('settingsDescription')}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    >
                      {theme === 'dark' ? (
                        <Sun className="h-5 w-5" />
                      ) : (
                        <Moon className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Search bar */}
                <div className="relative mt-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('searchSettings')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5 mb-6">
                    {Object.entries(getSettingsCategories()).map(([key, category]) => (
                      <TabsTrigger
                        key={key}
                        value={key}
                        className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                      >
                        {tabIcons[key]}
                        <span className="hidden sm:inline">{category.label}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <AnimatePresence mode="wait">
                    {Object.entries(getSettingsCategories()).map(([categoryKey, category]) => {
                      const filteredFields = filterFields(category.fields);
                      return (
                        <TabsContent key={categoryKey} value={categoryKey} className="mt-0">
                          <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                          >
                            {/* Special header for AI tab */}
                            {categoryKey === 'ai' ? (
                              <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border border-violet-500/20">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                                    <Sparkles className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <h3 className="text-lg font-semibold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                                      {category.label}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                      {category.description}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="mb-4">
                                <h3 className="text-lg font-semibold">{category.label}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {category.description}
                                </p>
                              </div>
                            )}

                            <div className="space-y-3">
                              {filteredFields.length > 0 ? (
                                filteredFields.map((fieldKey) => renderSettingsField(fieldKey))
                              ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                  {t('noSettingsMatch')}
                                </div>
                              )}
                              
                              {/* API Key input for AI category */}
                              {categoryKey === 'ai' && (
                                <motion.div
                                  layout
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="flex items-start justify-between p-4 rounded-lg bg-card hover:bg-accent/50 transition-colors border border-transparent hover:border-border"
                                >
                                  <div className="space-y-1 flex-1 pr-4">
                                    <Label className="text-base font-medium">API Key</Label>
                                    <p className="text-sm text-muted-foreground">Your AI provider API key (stored locally)</p>
                                    {apiKeyError && <p className="text-sm text-destructive">{apiKeyError}</p>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="relative">
                                      <Input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        onBlur={(e) => saveApiKey(e.target.value)}
                                        placeholder="sk-..."
                                        className="w-[200px] pr-8"
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full w-8"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                      >
                                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                      </Button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </motion.div>
                        </TabsContent>
                      );
                    })}
                  </AnimatePresence>
                </Tabs>

                {/* Action Buttons */}
                <div className="pt-8 border-t mt-8 flex flex-wrap gap-3 justify-between">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleExport}>
                      <Download className="h-4 w-4 mr-2" />
                      {t('export')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {t('import')}
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
                      {t('resetAll')}
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? t('saving') : t('saveChanges')}
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
