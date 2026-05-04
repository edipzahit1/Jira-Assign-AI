import React, { useState } from 'react';
import { Search, Plus, X } from 'lucide-react';

interface TagManagerProps {
    title: string;
    description: string;
    availableTags: string[];
    selectedTags: string[];
    onTagsChange: (tags: string[]) => void;
    searchPlaceholder?: string;
    libraryTitle?: string;
    dropZonePlaceholder?: string;
}

export function TagManager({
    title,
    description,
    availableTags,
    selectedTags,
    onTagsChange,
    searchPlaceholder = 'Search tags...',
    libraryTitle = 'Etiket Kütüphanesi',
    dropZonePlaceholder = 'Etiketleri buraya sürükleyin'
}: TagManagerProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);

    // Filter out tags that are already selected
    const unselectedTags = availableTags.filter(t => !selectedTags.includes(t));
    const filteredTags = unselectedTags.filter(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleAdd = (tag: string, e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!selectedTags.includes(tag)) {
            onTagsChange([...selectedTags, tag]);
        }
    };

    const handleRemove = (tag: string, e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        onTagsChange(selectedTags.filter(t => t !== tag));
    };

    const handleDragStart = (e: React.DragEvent, tag: string) => {
        e.dataTransfer.setData('text/plain', tag);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const tag = e.dataTransfer.getData('text/plain');
        if (tag && !selectedTags.includes(tag)) {
            handleAdd(tag);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-card rounded-xl p-6 border border-border shadow-sm">
                
                {/* LEFT: Tag Library */}
                <div className="flex flex-col space-y-4 h-full border-r border-border/50 pr-6">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">{libraryTitle}</h4>
                        <span className="text-[10px] text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full">{filteredTags.length}</span>
                    </div>
                    
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                        <input 
                            type="text" 
                            placeholder={searchPlaceholder} 
                            className="w-full h-9 bg-muted/50 border border-border rounded-lg pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-muted-foreground/70"
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                        />
                    </div>
                    
                    <div className="flex-1 min-h-[160px] max-h-[240px] overflow-y-auto custom-scrollbar flex flex-wrap gap-2 content-start pt-2">
                        {filteredTags.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground/70 italic p-4 text-center">
                                No matching tags found.
                            </div>
                        ) : (
                            filteredTags.map(tag => (
                                <div 
                                    key={tag}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, tag)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-transparent transition-all cursor-grab active:cursor-grabbing text-xs font-medium group"
                                >
                                    <span>{tag}</span>
                                    <button 
                                        onClick={(e) => handleAdd(tag, e)}
                                        className="opacity-50 group-hover:opacity-100 hover:bg-emerald-200/50 rounded-full p-0.5 transition-colors focus:outline-none"
                                    >
                                        <Plus size={12} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* RIGHT: Drop Zone */}
                <div className="flex flex-col h-full pl-2">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-foreground">Selected Tags</h4>
                        <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            {selectedTags.length} active
                        </span>
                    </div>

                    <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`flex-1 min-h-[180px] rounded-xl border-2 border-dashed transition-all flex flex-wrap gap-2 p-4 content-start ${
                            isDragOver 
                                ? 'border-emerald-500 bg-emerald-50/50' 
                                : selectedTags.length > 0 
                                    ? 'border-border/60 bg-background' 
                                    : 'border-border bg-muted/20'
                        }`}
                    >
                        {selectedTags.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center flex-col gap-2 text-muted-foreground pointer-events-none">
                                <div className="p-3 bg-background rounded-full shadow-sm border border-border/50">
                                    <Plus size={18} className="text-muted-foreground/50" />
                                </div>
                                <p className="text-xs font-medium">{dropZonePlaceholder}</p>
                            </div>
                        ) : (
                            selectedTags.map(tag => (
                                <div 
                                    key={tag}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold shadow-sm animate-in zoom-in-95 duration-200"
                                >
                                    <span>{tag}</span>
                                    <button 
                                        onClick={(e) => handleRemove(tag, e)}
                                        className="hover:bg-emerald-200 rounded-full p-0.5 transition-colors focus:outline-none"
                                    >
                                        <X size={12} className="text-emerald-700/70" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
