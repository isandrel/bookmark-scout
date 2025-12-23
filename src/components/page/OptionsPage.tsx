import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";

interface Option {
    id: string;
    label: string;
    value: string | boolean;
    type: 'select' | 'switch';
    description?: string;
    category?: string;
}

const defaultOptions: Option[] = [
    {
        id: 'sortOrder',
        label: 'Default Sort Order',
        value: 'date',
        type: 'select',
        description: 'How bookmarks should be sorted by default',
        category: 'Display'
    },
    {
        id: 'groupByFolders',
        label: 'Group by Folders',
        value: true,
        type: 'switch',
        description: 'Organize bookmarks by their folder structure',
        category: 'Display'
    },
    {
        id: 'showFavicons',
        label: 'Show Favicons',
        value: true,
        type: 'switch',
        description: 'Display website icons next to bookmarks',
        category: 'Display'
    },
    {
        id: 'searchHistory',
        label: 'Search History',
        value: true,
        type: 'switch',
        description: 'Enable search history tracking',
        category: 'Search'
    },
    {
        id: 'maxSearchResults',
        label: 'Maximum Search Results',
        value: '20',
        type: 'select',
        description: 'Maximum number of results to show in search',
        category: 'Search'
    }
];

const OptionsPage: React.FC = () => {
    const [options, setOptions] = useState<Option[]>(defaultOptions);

    useEffect(() => {
        chrome.storage.sync.get('options', (data) => {
            if (data.options && Array.isArray(data.options)) {
                setOptions(data.options as Option[]);
            }
        });
    }, []);

    const handleOptionChange = (id: string, value: string | boolean) => {
        const updatedOptions = options.map(option =>
            option.id === id ? { ...option, value } : option
        );
        setOptions(updatedOptions);

        chrome.storage.sync.set({ options: updatedOptions }, () => {
            console.log('Options saved');
        });
    };

    const handleReset = () => {
        chrome.storage.sync.clear(() => {
            setOptions(defaultOptions);
            chrome.storage.sync.set({ options: defaultOptions }, () => {
                console.log('Options reset to default');
            });
        });
    };

    // Group options by category
    const groupedOptions = options.reduce((acc, option) => {
        const category = option.category || 'Other';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(option);
        return acc;
    }, {} as Record<string, Option[]>);

    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
            <div className="container mx-auto p-6 max-w-3xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <Card className="border-none shadow-lg">
                        <CardHeader className="space-y-1">
                            <CardTitle className="text-2xl font-bold">Bookmark Scout Settings</CardTitle>
                            <CardDescription>
                                Customize your bookmark management experience
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            {Object.entries(groupedOptions).map(([category, categoryOptions], index) => (
                                <motion.div
                                    key={category}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: index * 0.1 }}
                                >
                                    <h3 className="text-lg font-semibold mb-4 text-muted-foreground">
                                        {category}
                                    </h3>
                                    <div className="space-y-6">
                                        {categoryOptions.map((option) => (
                                            <motion.div
                                                key={option.id}
                                                whileHover={{ scale: 1.01 }}
                                                className="flex items-start justify-between p-4 rounded-lg bg-card hover:bg-accent/50 transition-colors"
                                            >
                                                <div className="space-y-1">
                                                    <Label htmlFor={option.id} className="text-base">
                                                        {option.label}
                                                    </Label>
                                                    {option.description && (
                                                        <p className="text-sm text-muted-foreground">
                                                            {option.description}
                                                        </p>
                                                    )}
                                                </div>
                                                {option.type === 'select' ? (
                                                    <Select
                                                        value={option.value as string}
                                                        onValueChange={(value) => handleOptionChange(option.id, value)}
                                                    >
                                                        <SelectTrigger className="w-[180px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {option.id === 'sortOrder' ? (
                                                                <>
                                                                    <SelectItem value="date">Date Added</SelectItem>
                                                                    <SelectItem value="alphabetical">Alphabetical</SelectItem>
                                                                    <SelectItem value="folders">Folders</SelectItem>
                                                                </>
                                                            ) : option.id === 'maxSearchResults' ? (
                                                                <>
                                                                    <SelectItem value="10">10 results</SelectItem>
                                                                    <SelectItem value="20">20 results</SelectItem>
                                                                    <SelectItem value="50">50 results</SelectItem>
                                                                    <SelectItem value="100">100 results</SelectItem>
                                                                </>
                                                            ) : null}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <Switch
                                                        checked={option.value as boolean}
                                                        onCheckedChange={(checked: boolean) => handleOptionChange(option.id, checked)}
                                                    />
                                                )}
                                            </motion.div>
                                        ))}
                                    </div>
                                    {index < Object.keys(groupedOptions).length - 1 && (
                                        <Separator className="my-6" />
                                    )}
                                </motion.div>
                            ))}
                            <div className="pt-6 flex justify-end">
                                <Button
                                    variant="outline"
                                    onClick={handleReset}
                                    className="hover:bg-destructive/10 hover:text-destructive transition-colors"
                                >
                                    Reset to Default
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </div>
    );
};

export default OptionsPage;
