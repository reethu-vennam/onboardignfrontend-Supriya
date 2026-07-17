import { useI18n } from '@/i18n/I18nProvider';
import { Globe } from 'lucide-react';

interface LanguageSelectorProps {
    compact?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ compact }) => {
    const { language } = useI18n();

    // Only English is supported. Render a non-interactive label.
    return (
        <div className={compact ? 'w-fit gap-1 border-0 bg-transparent px-2 shadow-none flex items-center' : 'w-[180px] flex items-center gap-2'}>
            <Globe className="h-4 w-4" />
            <span>{language === 'en' ? 'English' : 'English'}</span>
        </div>
    );
};
