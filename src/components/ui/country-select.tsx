import React, { useMemo, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { Combobox, type ComboboxOption } from './combobox';

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
  "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
  "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria",
  "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada",
  "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros",
  "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica",
  "Dominican Republic", "East Timor", "Ecuador", "Egypt", "El Salvador",
  "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji",
  "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece",
  "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras",
  "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan",
  "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon",
  "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Macau", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta",
  "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova",
  "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia",
  "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria",
  "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine",
  "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia",
  "Saint Vincent and the Grenadines", "Samoa", "San Marino", "São Tomé and Príncipe",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore",
  "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea",
  "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland",
  "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Tonga",
  "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda",
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
  "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia",
  "Zimbabwe",
];

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const CountrySelect: React.FC<CountrySelectProps> = ({
  value,
  onChange,
  placeholder = 'Select country...',
  className,
  disabled,
}) => {
  const options: ComboboxOption[] = useMemo(
    () => COUNTRIES.map((c) => ({ value: c, label: c })),
    []
  );

  const selected = value || null;

  return (
    <Combobox
      options={options}
      value={selected}
      onChange={(val) => onChange(val)}
      placeholder={placeholder}
      searchPlaceholder="Search countries..."
      className={className}
      disabled={disabled}
    />
  );
};

// ─── Multi-select variant ─────────────────────────────────────────

interface CountryMultiSelectProps {
  value: string[];
  onChange: (countries: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const CountryMultiSelect: React.FC<CountryMultiSelectProps> = ({
  value,
  onChange,
  placeholder = 'Add country...',
  className,
  disabled,
}) => {
  const [adding, setAdding] = useState(false);

  const options: ComboboxOption[] = useMemo(
    () => COUNTRIES
      .filter((c) => !value.includes(c))
      .map((c) => ({ value: c, label: c })),
    [value]
  );

  const handleAdd = useCallback((country: string) => {
    if (!value.includes(country)) {
      onChange([...value, country].sort());
    }
    setAdding(false);
  }, [value, onChange]);

  const handleRemove = useCallback((country: string) => {
    onChange(value.filter((c) => c !== country));
  }, [value, onChange]);

  return (
    <div className={className}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((country) => (
            <span
              key={country}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
            >
              {country}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(country)}
                  className="ml-0.5 rounded-sm hover:bg-accent p-0.5 -mr-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {adding ? (
        <Combobox
          options={options}
          value={null}
          onChange={(val) => handleAdd(val)}
          placeholder={placeholder}
          searchPlaceholder="Search countries..."
          disabled={disabled}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={disabled}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          + Add country
        </button>
      )}
    </div>
  );
};
