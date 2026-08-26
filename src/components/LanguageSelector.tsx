import { useI18n } from '@/i18n/I18nProvider';
import { languages } from '@/i18n/translations';
import { Check, ChevronDown, Globe } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface LanguageSelectorProps {
    compact?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ compact }) => {
    const { language, setLanguage } = useI18n();
    const current = languages.find(l => l.code === language) ?? languages[0];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={compact ? 'w-fit gap-1 border-0 bg-transparent px-2 shadow-none' : 'w-[180px] justify-start gap-2'}
                >
                    <Globe className="h-4 w-4" />
                    <span>{current.nativeLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
                {languages.map(l => (
                    <DropdownMenuItem
                        key={l.code}
                        onClick={() => setLanguage(l.code)}
                        className="justify-between"
                    >
                        <span>{l.nativeLabel}</span>
                        {language === l.code && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
