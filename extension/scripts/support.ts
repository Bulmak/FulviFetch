import {existsSync} from 'node:fs';

// Firefox deriva el identificador del widget de la barra de herramientas a
// partir del ID del complemento: los caracteres que no son alfanuméricos se
// sustituyen porguion bajo. Se calcula para no depender de un valor copiado a
// mano que se desincroniza al cambiar el manifiesto.
export function widgetBaseFor(addonId: string): string {
  return addonId.replace(/[^\w-]/g, '_');
}

// Busca un binario: primero en la variable de entorno y, si no está, en las
// rutas habituales de cada sistema. Una ruta configurada que no existe no se
// acepta en silencio, para que el fallo se vea en la primera ejecución.
export function locateBinary(envVar: string, candidates: string[]): string | undefined {
  const configured = process.env[envVar]?.trim();
  if (configured) return existsSync(configured) ? configured : undefined;
  return candidates.find(candidate => existsSync(candidate));
}
