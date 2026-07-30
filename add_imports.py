with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

imports = """import { currency, percent, preciseCurrency, initials, formatKeyResult, healthLabel, timeAgoLabel, relativeTimestamp, capitalizeFirst, isSameDate, buildMonthGrid } from './utils/formatters';
import { ACTION_LABELS, STAGE_PILL_CLASS, ACTION_STATUS_LABELS, ACTION_STATUS_ORDER, nextActionStatus, navItems, SECTION_ICONS, WEEKDAY_LABELS } from './utils/constants';
import { downloadCsv, parseCsv } from './utils/csv';
import { DealModal } from './components/modals/DealModal';
import { SellerModal } from './components/modals/SellerModal';
import { ActionItemModal } from './components/modals/ActionItemModal';
import { MonthlyRecordModal } from './components/modals/MonthlyRecordModal';
import { DealDrilldownModal } from './components/modals/DealDrilldownModal';
import { DailyPromptModal } from './components/modals/DailyPromptModal';
import { ObjectiveModal } from './components/modals/ObjectiveModal';
import { TargetEditable } from './components/TargetEditable';
import { EditableCurrencyCell } from './components/EditableCurrencyCell';
"""

c = imports + '\n' + c
with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print("Added imports to CommercialControl.tsx")
