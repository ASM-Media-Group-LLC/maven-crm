/** Country code → main cities mapping */

const CITY_DATA: Record<string, string[]> = {
  AR: ["Buenos Aires", "Córdoba", "Rosario", "Mendoza", "Tucumán", "La Plata", "Mar del Plata", "Salta", "Santa Fe"],
  BO: ["La Paz", "Santa Cruz", "Cochabamba", "Sucre", "Oruro", "Tarija", "Potosí"],
  BR: ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Fortaleza", "Belo Horizonte", "Manaus", "Curitiba", "Recife", "Porto Alegre"],
  GB: ["Londres", "Manchester", "Birmingham", "Liverpool", "Leeds", "Glasgow", "Edimburgo"],
  CL: ["Santiago", "Valparaíso", "Concepción", "Antofagasta", "Viña del Mar", "Temuco", "Rancagua"],
  CO: ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Bucaramanga", "Pereira", "Santa Marta", "Manizales", "Cúcuta", "Ibagué", "Villavicencio"],
  CR: ["San José", "Alajuela", "Cartago", "Heredia", "Liberia"],
  CU: ["La Habana", "Santiago de Cuba", "Camagüey", "Holguín", "Santa Clara"],
  DO: ["Santo Domingo", "Santiago", "San Pedro de Macorís", "La Romana", "Puerto Plata"],
  EC: ["Quito", "Guayaquil", "Cuenca", "Ambato", "Manta", "Machala", "Loja"],
  SV: ["San Salvador", "Santa Ana", "San Miguel", "Soyapango"],
  ES: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga", "Bilbao", "Zaragoza", "Palma de Mallorca"],
  US: ["New York", "Los Angeles", "Miami", "Houston", "Chicago", "Phoenix", "San Francisco", "Dallas", "Atlanta", "Las Vegas"],
  GT: ["Ciudad de Guatemala", "Quetzaltenango", "Escuintla", "Mixco"],
  HN: ["Tegucigalpa", "San Pedro Sula", "La Ceiba", "Choloma"],
  IT: ["Roma", "Milán", "Nápoles", "Turín", "Florencia", "Bolonia", "Venecia"],
  MX: ["Ciudad de México", "Guadalajara", "Monterrey", "Puebla", "Cancún", "Tijuana", "León", "Mérida", "Querétaro", "Chihuahua"],
  NI: ["Managua", "León", "Masaya", "Chinandega", "Granada"],
  PA: ["Ciudad de Panamá", "Colón", "David", "Santiago"],
  PY: ["Asunción", "Ciudad del Este", "San Lorenzo", "Luque", "Encarnación"],
  PE: ["Lima", "Arequipa", "Cusco", "Trujillo", "Chiclayo", "Piura", "Iquitos"],
  PR: ["San Juan", "Bayamón", "Carolina", "Ponce", "Caguas"],
  TH: ["Bangkok", "Chiang Mai", "Pattaya", "Phuket", "Krabi"],
  UY: ["Montevideo", "Salto", "Paysandú", "Ciudad de la Costa", "Maldonado"],
  VE: ["Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Maracay", "Ciudad Guayana", "Mérida"],
};

export function getCitiesByCountryCode(code: string | null | undefined): string[] {
  if (!code) return [];
  return CITY_DATA[code.toUpperCase()] || [];
}

export function getAllCountryCodes(): string[] {
  return Object.keys(CITY_DATA);
}
