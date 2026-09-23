// Deployment commit: desplegado
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Send, CheckCircle, AlertCircle, ChevronDown,
  User, Home, Calendar, ClipboardList, Wrench, DollarSign,
  MessageSquare, PlusCircle, Loader2, Moon, Sun, Truck, Eraser, Pencil, FolderPlus,
  Search, Trash2, ChevronLeft, ChevronRight, Eye, HelpCircle
} from 'lucide-react';
// ─── Opciones del desplegable (igual que en el Excel) ──────────────────────────
const CLASIFICACIONES = [
  "MOVILIARIO",
  "INSTALACIONES",
  "MANTENIMIENTO",
  "ELECTRODOMESTICO",
  "MENAJE",
  "MALA GESTION",
  "OTRO",
];

const ESTADOS_INICIALES = ["PENDIENTE", "RESUELTA"];

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwhQ4teH9bNt6HVNgYrKi_sfZ9HvujWQppcLaLIp80P2LbcpHPiNPcu6mWFU6eIUXcW/exec";

// Las acciones administrativas necesitan una respuesta legible antes de confirmar éxito.
async function requestAdmin(action, params = {}, write = false, signal) {
  const controller = new AbortController();
  // scanStructure en producción ha tardado 64 s medidos: 60 s cortaba consultas que sí iban a terminar.
  const timeout = setTimeout(() => controller.abort(), 180000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const query = new URLSearchParams({ action, ...params });
    const response = await fetch(write ? GOOGLE_SCRIPT_URL : `${GOOGLE_SCRIPT_URL}?${query}`, {
      signal: controller.signal,
      ...(write ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...params }) } : {})
    });
    if (!response.ok) throw new Error(`Error de conexión (${response.status}).`);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch {
      throw new Error(text.startsWith('ERROR:') ? text.slice(6).trim() : 'El servidor no devolvió una respuesta válida.');
    }
    if (!data || typeof data !== 'object') throw new Error('Respuesta inesperada del servidor.');
    if (data.success === false || (data.error && !Array.isArray(data.all))) throw new Error(data.error || 'La operación no se completó.');
    if (write && data.success !== true) throw new Error('El servidor no confirmó la operación.');
    return data;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error(write ? 'No se pudo confirmar la operación a tiempo. Actualiza y revisa Drive antes de repetirla.' : 'La consulta está tardando demasiado. Vuelve a intentarlo.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

// ─── Estado inicial del formulario ────────────────────────────────────────────
const FORM_INICIAL = {
  responsable: "",
  fecha: new Date().toISOString().split("T")[0],
  ref: "",
  propiedad: "",
  clasificacion: "",
  clasificacionOtro: "",
  descripcion: "",
  operario: "",
  proveedor: "",
  costoManoObra: "",
  accionTomada: "",
  planAccion: "",
  estado: "PENDIENTE",
  nombreFactura: "",
  idFactura: "",
  rowIndex: null,
};

// Auxiliares
const formatearFecha = (fechaStr) => {
  if (!fechaStr) return "—";
  try {
    const fecha = new Date(fechaStr);
    if (isNaN(fecha.getTime())) return fechaStr; // Retornar tal cual si falla el parseo
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(fecha);
  } catch (e) {
    return fechaStr;
  }
};

const normalizarFechaParaInput = (fechaRaw) => {
  if (!fechaRaw) return new Date().toISOString().split("T")[0];
  try {
    const d = new Date(fechaRaw);
    if (isNaN(d.getTime())) return new Date().toISOString().split("T")[0];

    // Usar componentes locales para evitar desfases de zona horaria
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return new Date().toISOString().split("T")[0];
  }
};

// La hoja tiene dos columnas de referencia: "ref" (histórico) y "REF. FACTURA " (con
// espacio final). Se lee la que tenga valor para que se vean las filas viejas y las nuevas.
const refDeIncidencia = (inc) => {
  const raw = inc["ref"] || inc["REF. FACTURA "] || inc["REF. FACTURA"] || "";
  return String(raw).trim() === "" ? "" : String(raw).trim().padStart(3, '0');
};

// Identificador único de cada factura: se genera aquí porque el POST va en no-cors
// y no se puede leer la respuesta del Apps Script.
const nuevoIdFactura = () =>
  `FAC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

// ─── Vista previa de la factura ya guardada en Drive ──────────────────────────
// Busca inteligentemente en el mes correspondiente o en cualquier otro mes del año
function FacturaPreview({ refNum, fecha, idFactura, nombreFactura, propiedad, mes: mesPeriodo, anio: anioPeriodo }) {
  const d = new Date(fecha);
  const valida = !isNaN(d.getTime());
  const defaultMes = mesPeriodo || MONTHS[valida ? d.getMonth() : new Date().getMonth()];
  const defaultAnio = anioPeriodo || String(valida ? d.getFullYear() : new Date().getFullYear());

  const [currentMonth, setCurrentMonth] = useState(defaultMes);
  const [currentYear, setCurrentYear] = useState(defaultAnio);
  const [file, setFile] = useState(undefined); // undefined = cargando, null = no encontrada
  const [monthFiles, setMonthFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function buscar() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          action: "findInvoice",
          id: idFactura || "",
          name: nombreFactura || "",
          ref: refNum || "",
          month: currentMonth || "",
          year: currentYear || "",
          propiedad: propiedad || ""
        });
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
        const data = await res.json();
        if (!cancelado) {
          if (data.found && data.file) {
            setFile(data.file);
            if (data.foundInMonth && data.foundInMonth !== currentMonth) {
              setCurrentMonth(data.foundInMonth);
            }
          } else {
            setFile(null);
          }
          if (Array.isArray(data.monthFiles)) {
            setMonthFiles(data.monthFiles);
          } else {
            setMonthFiles([]);
          }
        }
      } catch (err) {
        if (!cancelado) setFile(null);
      } finally {
        if (!cancelado) setLoading(false);
      }
    }

    buscar();
    return () => { cancelado = true; };
  }, [refNum, currentMonth, currentYear, idFactura, nombreFactura, propiedad]);

  return (
    <div className="preview-container animate-fade-in">
      <div className="preview-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', padding: '0.5rem 0.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Selector de periodo (Mes y Año) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Mes:</span>
            <select
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: 'inherit',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                padding: '3px 6px',
                fontSize: '0.78rem'
              }}
            >
              {MONTHS.map(m => <option key={m} value={m} style={{ color: '#000' }}>{m}</option>)}
            </select>
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: 'inherit',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                padding: '3px 6px',
                fontSize: '0.78rem'
              }}
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={String(y)} style={{ color: '#000' }}>{y}</option>)}
            </select>
          </div>

          {/* Selector de archivo del mes */}
          {monthFiles.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Archivo ({monthFiles.length}):
              </span>
              <select
                value={file?.fileId || ""}
                onChange={(e) => {
                  const sel = monthFiles.find(f => f.fileId === e.target.value);
                  if (sel) setFile(sel);
                }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: 'inherit',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '0.78rem',
                  maxWidth: '300px'
                }}
              >
                {monthFiles.map(f => (
                  <option key={f.fileId} value={f.fileId} style={{ color: '#000' }}>
                    {f.fullName} {f.ref && f.ref !== '---' ? `(Ref ${f.ref})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {file && (
          <a href={file.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem' }}>Abrir en Drive</a>
        )}
      </div>

      {loading ? (
        <div className="upload-status-mini info" style={{ margin: '0.8rem' }}>
          Buscando facturas en {currentMonth} {currentYear}...
        </div>
      ) : file ? (
        <iframe
          src={`https://drive.google.com/file/d/${file.fileId}/preview`}
          title="Vista previa de la factura"
          className="preview-media pdf-preview"
        />
      ) : (
        <div className="upload-status-mini error" style={{ margin: '0.8rem' }}>
          No hay facturas en {currentMonth} {currentYear}. Puedes cambiar el mes o año arriba para buscar en otro periodo.
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function App() {
  const [form, setForm] = useState(FORM_INICIAL);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", msg: "" });
  const [showSuccess, setShowSuccess] = useState(false);

  // Pestañas e Historial
  const [activeTab, setActiveTab] = useState("nuevo");
  const [incidencias, setIncidencias] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const historyLoadedAt = useRef(0);
  const historyRequest = useRef(null);

  // Modo Edición (Visual)
  const [isEditing, setIsEditing] = useState(false);

  // Gestión de Facturas y Referencias
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [nextRef, setNextRef] = useState("...");
  const [existingRefs, setExistingRefs] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewType, setPreviewType] = useState(null);
  // Nombre del archivo seleccionado para el campo REF
  const [selectedRefFileName, setSelectedRefFileName] = useState("");

  // Historial: Filtros y Paginación
  const [filterPropiedad, setFilterPropiedad] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [previewRow, setPreviewRow] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Propiedades desde Google Sheet (sin Apps Script)
  const [propiedadesLocales, setPropiedadesLocales] = useState([]);
  const [loadingPropiedades, setLoadingPropiedades] = useState(false);
  const [searchPropiedad, setSearchPropiedad] = useState("");
  const [showPropDropdown, setShowPropDropdown] = useState(false);

  useEffect(() => {
    const fetchPropiedades = async () => {
      setLoadingPropiedades(true);
      try {
        const url = "https://docs.google.com/spreadsheets/d/1Z1qYQ2ykQG2Kq1hO9K2PdjES_OvOR2d1yKPv7MdyAa4/gviz/tq?tqx=out:json&sheet=ALOJAMIENTOS%20ACTIVOS";
        const res = await fetch(url);
        const text = await res.text();
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const data = JSON.parse(jsonString);

        const props = [];
        if (data && data.table && data.table.rows) {
          data.table.rows.forEach(row => {
            if (row.c && row.c[0] && row.c[0].v) {
              const propName = row.c[0].v;
              let ref = '';
              // Ahora la REF está en la columna D (índice 3) tras la inserción de nuevas columnas
              if (row.c[3]) {
                if (row.c[3].f) ref = row.c[3].f;
                else if (row.c[3].v) ref = String(row.c[3].v);
              }
              // Capturar Encargado (Columna B -> índice 1)
              let encargado = '';
              if (row.c[1] && row.c[1].v) encargado = String(row.c[1].v);

              props.push({ name: propName, ref: ref, encargado: encargado });
            }
          });
        }
        setPropiedadesLocales(props);
      } catch (e) {
        console.error("Error cargando propiedades:", e);
      } finally {
        setLoadingPropiedades(false);
      }
    };
    fetchPropiedades();
  }, []);

  // Administración: Colores y Trimestres
  const [adminScan, setAdminScan] = useState(null);
  const [adminError, setAdminError] = useState(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [selectedAdminYear, setSelectedAdminYear] = useState(currentYear.toString());
  const [colorAssignments, setColorAssignments] = useState({});
  const [creatingStructure, setCreatingStructure] = useState(false);
  const [createResult, setCreateResult] = useState(null);

  const adminScanCache = useRef({ year: null, at: 0 });
  const adminScanRequest = useRef(null);
  const adminPropertiesCache = useRef(0);
  const adminPropertiesRequest = useRef(false);
  const adminMutation = useRef(false);

  // ── Tema ──────────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const fetchIncidencias = async (force = false) => {
    if (historyRequest.current || (!force && Date.now() - historyLoadedAt.current < 60000)) return;
    const controller = new AbortController();
    historyRequest.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    setLoadingHistory(true);
    setHistoryError("");
    try {
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=read`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Error de conexión (${response.status}).`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error(data?.error || "El servidor devolvió una respuesta inesperada.");
      if (controller.signal.aborted) return;
      data.sort((a, b) => {
        const dateA = new Date(a["FECHA"] || a["FECHA REPORTE INCIDENCIA"]).getTime() || 0;
        const dateB = new Date(b["FECHA"] || b["FECHA REPORTE INCIDENCIA"]).getTime() || 0;
        return dateB - dateA;
      });
      setIncidencias(data);
      historyLoadedAt.current = Date.now();
      setCurrentPage(1);
    } catch (error) {
      if (!controller.signal.aborted || timedOut) {
        setHistoryError(timedOut
          ? "Google Sheets está tardando demasiado. Vuelve a intentarlo."
          : `No se pudo cargar el historial: ${error.message}`);
      }
    } finally {
      clearTimeout(timeout);
      historyRequest.current = null;
      setLoadingHistory(false);
    }
  };

  useEffect(() => () => historyRequest.current?.abort(), []);

  useEffect(() => {
    if (activeTab === "nuevo") fetchNextRef(selectedMonth, selectedYear);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "nuevo") fetchNextRef(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear]);

  const fetchNextRef = async (month, year) => {
    setLoadingRefs(true);
    try {
      const params = month && year ? `&month=${month}&year=${year}&_t=${Date.now()}` : `&_t=${Date.now()}`;
      const resNext = await fetch(`${GOOGLE_SCRIPT_URL}?action=getNextRef${params}`);
      const dataNext = await resNext.json();
      // FORZAR STRING para evitar notación científica
      if (dataNext.nextRef) setNextRef(String(dataNext.nextRef));

      const resAll = await fetch(`${GOOGLE_SCRIPT_URL}?action=getAllRefs${params}`);
      const dataAll = await resAll.json();
      if (Array.isArray(dataAll.refs)) {
        // Forzar ref como string en cada item
        const refs = dataAll.refs.map(item => ({ ...item, ref: String(item.ref) }));
        setExistingRefs(refs);
        return refs;
      }
      setExistingRefs([]);
      return [];
    } catch (error) {
      console.error("Error al obtener referencias:", error);
      setExistingRefs([]);
      return [];
    } finally {
      setLoadingRefs(false);
    }
  };

  const fetchScanStructure = async (year, force = false) => {
    if (!force && adminScanCache.current.year === year && Date.now() - adminScanCache.current.at < 60000) return;
    if (!force && adminScanRequest.current?.year === year) return;
    adminScanRequest.current?.controller.abort();
    const controller = new AbortController();
    adminScanRequest.current = { year, controller };
    setLoadingAdmin(true);
    setAdminError(null);
    setAdminScan(null);
    setColorAssignments({});
    try {
      const data = await requestAdmin('scanStructure', { year }, false, controller.signal);
      if (String(data.year) !== String(year) || !Array.isArray(data.colorPalette) ||
          !['Q1', 'Q2', 'Q3', 'Q4'].every(q => Array.isArray(data.structure?.[q]))) {
        throw new Error('El escaneo de Drive está incompleto. Vuelve a intentarlo.');
      }
      if (controller.signal.aborted) return;
      setAdminScan(data);
      adminScanCache.current = { year, at: Date.now() };
    } catch (err) {
      if (!controller.signal.aborted) setAdminError(err.message);
    } finally {
      if (adminScanRequest.current?.controller === controller) {
        adminScanRequest.current = null;
        setLoadingAdmin(false);
      }
    }
  };

  useEffect(() => () => adminScanRequest.current?.controller.abort(), []);

  const handleCreateStructure = async () => {
    if (adminMutation.current || !Object.keys(colorAssignments).length) return;
    adminMutation.current = true;
    setCreatingStructure(true);
    setCreateResult(null);
    try {
      const data = await requestAdmin('createYearStructure', { year: selectedAdminYear, colorAssignments }, true);
      setCreateResult({ success: true, msg: `Estructura de ${selectedAdminYear} preparada. ${(data.warnings || []).join(' ')}` });
      await fetchScanStructure(selectedAdminYear, true);
    } catch (err) {
      setCreateResult({ success: false, msg: err.message });
    } finally {
      adminMutation.current = false;
      setCreatingStructure(false);
    }
  };

  const [adminProperties, setAdminProperties] = useState({ all: [], lodgify: [], manual: [] });
  const [loadingAdminProps, setLoadingAdminProps] = useState(false);
  const [adminPropsError, setAdminPropsError] = useState(null);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [addingProperty, setAddingProperty] = useState(false);
  const [propertyResult, setPropertyResult] = useState(null);

  const fetchAdminProperties = async (force = false) => {
    if (adminPropertiesRequest.current || (!force && Date.now() - adminPropertiesCache.current < 300000)) return;
    adminPropertiesRequest.current = true;
    setLoadingAdminProps(true);
    setAdminPropsError(null);
    try {
      const data = await requestAdmin('getProperties');
      if (!['all', 'lodgify', 'manual'].every(k => Array.isArray(data[k]) && data[k].every(n => typeof n === 'string'))) {
        throw new Error('La lista de propiedades está incompleta. Vuelve a intentarlo.');
      }
      setAdminProperties(data);
      setAdminPropsError(data.error || null);
      adminPropertiesCache.current = data.error ? 0 : Date.now();
    } catch (err) {
      setAdminPropsError(err.message);
    } finally {
      adminPropertiesRequest.current = false;
      setLoadingAdminProps(false);
    }
  };

  const handleAddProperty = async () => {
    const name = newPropertyName.trim();
    if (!name || adminMutation.current || loadingAdminProps) return;
    adminMutation.current = true;
    setAddingProperty(true);
    setPropertyResult(null);
    try {
      const data = await requestAdmin('addManualProperty', { name }, true);
      if (!Array.isArray(data.manual) || !data.manual.every(n => typeof n === 'string')) throw new Error('No se pudo verificar la lista de propiedades. Actualízala antes de repetir.');
      setAdminProperties(prev => ({ ...prev, manual: data.manual, all: [...new Map([...prev.lodgify, ...data.manual].map(n => [n.toUpperCase(), n])).values()].sort() }));
      adminPropertiesCache.current = 0;
      setNewPropertyName("");
      setPropertyResult({ success: true, msg: data.alreadyExists ? 'La propiedad ya estaba registrada.' : 'Propiedad añadida. Ya puedes elegirla en Nuevo Reporte.' });
    } catch (err) {
      setPropertyResult({ success: false, msg: err.message });
    } finally {
      adminMutation.current = false;
      setAddingProperty(false);
    }
  };

  const [creatingPropFolders, setCreatingPropFolders] = useState(false);
  const [propFoldersResult, setPropFoldersResult] = useState(null);
  const adminBusy = creatingStructure || creatingPropFolders || addingProperty;

  const handleCreatePropertyFolders = async () => {
    if (adminMutation.current || loadingAdminProps || adminPropsError || !adminProperties.all.length) return;
    adminMutation.current = true;
    setCreatingPropFolders(true);
    setPropFoldersResult(null);
    try {
      const data = await requestAdmin('createPropertyFolders', { year: selectedAdminYear, propiedades: adminProperties.all }, true);
      if (!Number.isInteger(data.count)) throw new Error('No se pudo verificar el número de propiedades. Revisa Drive antes de repetir.');
      setPropFoldersResult({ success: true, msg: `Carpetas preparadas para ${data.count} propiedades en ${selectedAdminYear}.` });
    } catch (err) {
      setPropFoldersResult({ success: false, msg: err.message });
    } finally {
      adminMutation.current = false;
      setCreatingPropFolders(false);
    }
  };

  const handleDelete = async (inc) => {
    if (!window.confirm(`¿Estás seguro de que deseas borrar la incidencia de "${inc["PROPIEDAD"]}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setLoadingHistory(true);
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({ action: "delete", rowIndex: inc.rowIndex }),
      });

      // Al borrar una fila cambian los índices: releer antes de editar otra.
      historyLoadedAt.current = 0;
      setIncidencias([]);
      await fetchIncidencias(true);
      setStatus({ type: "success", msg: "Incidencia eliminada correctamente." });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Error al borrar:", error);
      setStatus({ type: "error", msg: "Error al borrar la incidencia." });
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleEdit = (inc) => {
    // Mapear campos de Excel a campos de Formulario
    const dataToEdit = {
      responsable: inc["RESPONSABLE DEL REPORTE"] || "",
      fecha: normalizarFechaParaInput(inc["FECHA"] || inc["FECHA REPORTE INCIDENCIA"]),
      ref: refDeIncidencia(inc),
      propiedad: inc["PROPIEDAD"] || "",
      clasificacion: CLASIFICACIONES.includes(inc["CLASIFICACION DE LA INCIDENCIA"])
        ? inc["CLASIFICACION DE LA INCIDENCIA"]
        : "OTRO",
      clasificacionOtro: CLASIFICACIONES.includes(inc["CLASIFICACION DE LA INCIDENCIA"])
        ? ""
        : inc["CLASIFICACION DE LA INCIDENCIA"] || "",
      descripcion: inc["DESCRIPCION DE LA INCIDENCIA"] || "",
      operario: inc["OPERARIO"] || "",
      proveedor: inc["PROVEEDOR"] || "",
      costoManoObra: inc["costo mano obra"] || "",
      accionTomada: inc["ACCION TOMADA"] || "",
      planAccion: inc["PLAN DE ACCION"] || "",
      estado: inc["ESTADO"] || "PENDIENTE",
      nombreFactura: inc["NOMBRE FACTURA"] || "",
      idFactura: inc["ID FACTURA"] || "",
      rowIndex: inc.rowIndex,
    };

    setForm(dataToEdit);
    setIsEditing(true);
    setActiveTab("nuevo");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setForm(FORM_INICIAL);
    setIsEditing(false);
    setStatus({ type: "", msg: "" });
    setPreviewUrl(null);
    setPreviewType(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Orden obligatorio: propiedad → nombre → archivo. Evita facturas duplicadas (mismo nombre, propiedad y mes, o segunda subida en la misma incidencia).
  const nombreFacturaSubida = form.nombreFactura.trim();
  // Las refs se numeran por mes para todas las propiedades, pero el selector solo enseña las de la propiedad elegida.
  const refsPropiedad = form.propiedad
    ? existingRefs.filter(r => String(r.propiedad || "").trim().toUpperCase() === String(form.propiedad).trim().toUpperCase())
    : existingRefs;
  const facturaRepetida = nombreFacturaSubida && form.propiedad && refsPropiedad.some(r =>
    String(r.clientName || "").split(/ FAC-/i)[0].trim().toUpperCase() === nombreFacturaSubida.toUpperCase()
  );
  const bloqueoSubida =
    !/^\d+$/.test(String(nextRef)) ? "Esperando la referencia de Drive..." :
    !form.propiedad       ? "Primero elige la propiedad." :
    !nombreFacturaSubida  ? "Escribe el nombre de la factura antes de subirla." :
    facturaRepetida       ? `Ya existe una factura "${nombreFacturaSubida}" para ${form.propiedad} en ${selectedMonth}. Cambia el nombre si es otra distinta.` :
    form.idFactura        ? "Esta incidencia ya tiene una factura subida." :
    "";

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (bloqueoSubida) {
      setUploadStatus({ type: 'error', msg: bloqueoSubida });
      e.target.value = "";
      return;
    }

    const idFactura = nuevoIdFactura();

    // Crear URL temporal para la vista previa
    const fileUrl = URL.createObjectURL(file);
    setPreviewUrl(fileUrl);
    setPreviewType(file.type);

    setIsUploading(true);
    setUploadStatus({ type: 'info', msg: 'Subiendo factura y generando referencia...' });

    try {
      const currentNextRef = String(nextRef); // SIEMPRE STRING
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
      const finalFileName = `${nombreFacturaSubida} ${idFactura} ${currentNextRef}.${ext}`;

      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const base64 = event.target.result;
          const payload = {
            action: "uploadInvoice",
            fileBase64: base64,
            fileName: file.name,
            invoiceId: idFactura,
            invoiceName: nombreFacturaSubida,
            refNumber: String(currentNextRef), // FORZAR STRING para evitar float
            month: selectedMonth,
            year: selectedYear,
            propiedad: form.propiedad
          };

          // POST a Apps Script con no-cors para evitar el bloqueo del navegador
          await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify(payload)
          });

          // no-cors no deja leer la respuesta: se comprueba en Drive que la factura está
          const refs = await fetchNextRef(selectedMonth, selectedYear);
          const enDrive = refs.some(r => r.ref === String(currentNextRef).padStart(3, '0'));

          if (!enDrive) {
            setUploadStatus({ type: 'error', msg: `⚠️ Drive no confirma la factura ${currentNextRef} en ${selectedMonth} ${selectedYear}. No se ha guardado: revisa que exista la carpeta del trimestre.` });
            return;
          }

          setForm(prev => ({ ...prev, ref: currentNextRef, idFactura }));
          setSelectedRefFileName(finalFileName);
          setUploadStatus({ type: 'success', msg: `✅ Factura subida: "${finalFileName}"` });
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 3000);
        } catch (postError) {
          setUploadStatus({ type: 'error', msg: 'Error de red al subir la factura.' });
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setUploadStatus({ type: 'error', msg: 'Error al procesar: ' + error.message });
      setIsUploading(false);
    }
  };

  const clasificacionFinal =
    form.clasificacion === "OTRO" ? form.clasificacionOtro : form.clasificacion;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.responsable || !form.propiedad || !form.clasificacion || !form.descripcion) {
      setStatus({ type: "error", msg: "Por favor, rellena los campos obligatorios (*)." });
      return;
    }

    setLoading(true);
    setStatus({ type: "info", msg: isEditing ? "Guardando cambios..." : "Enviando incidencia..." });

    const payload = {
      "REF. FACTURA": form.ref,
      "ref": form.ref, // la hoja tiene las dos columnas: se escriben ambas para que no se desincronicen
      "ID FACTURA": form.idFactura,
      "NOMBRE FACTURA": form.nombreFactura,
      "PROPIEDAD": form.propiedad,
      "CLASIFICACION DE LA INCIDENCIA": clasificacionFinal,
      "DESCRIPCION DE LA INCIDENCIA": form.descripcion,
      "OPERARIO": form.operario,
      "PROVEEDOR": form.proveedor,
      "ESTADO": form.estado,
      "ACCION TOMADA": form.accionTomada,
      "PLAN DE ACCION": form.planAccion,
      "FECHA": form.fecha,
      "FECHA REPORTE INCIDENCIA": form.fecha,
      "costo mano obra": form.costoManoObra,
      "RESPONSABLE DEL REPORTE": form.responsable,
      "rowIndex": form.rowIndex,
    };

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify(payload),
      });

      historyRequest.current?.abort();
      historyLoadedAt.current = 0;
      setIncidencias([]);

      setStatus({
        type: "success",
        msg: isEditing ? "¡Incidencia actualizada correctamente!" : "¡Tu reporte ha sido procesado correctamente!"
      });
      setShowSuccess(true);
      resetForm();
      setTimeout(() => setShowSuccess(false), 4000);

    } catch (error) {
      setStatus({ type: "error", msg: "Error al procesar: " + error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrap">

      {/* ── TOAST ──────────────────────────────────── */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            className="toast toast-success"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
          >
            <CheckCircle size={20} />
            {isEditing ? "Cambios guardados con éxito" : "¡Incidencia guardada!"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CABECERA ───────────────────────────────── */}
      <header className="app-header animate-fade-in">
        <div className="header-left">
          <div className="header-icon-wrap">
            <FileText size={30} />
          </div>
          <div>
            <h1>Incidencias 2026</h1>
            <p className="subtitle">Gestión y seguimiento administrativo</p>
          </div>
        </div>

        {/* Botón toggle tema */}
        <button
          className="theme-toggle"
          onClick={() => setDarkMode((d) => !d)}
          aria-label="Cambiar tema"
        >
          <AnimatePresence mode="wait" initial={false}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </AnimatePresence>
          <span className="theme-label">{darkMode ? "Claro" : "Oscuro"}</span>
        </button>
      </header>

      {/* ── TABS NAVEGACIÓN ────────────────────────── */}
      <nav className="tabs-container animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <button
          className={`tab-btn ${activeTab === "nuevo" ? "active" : ""}`}
          onClick={() => { setActiveTab("nuevo"); if (!isEditing) resetForm(); }}
        >
          {isEditing ? <Pencil size={18} /> : <PlusCircle size={18} />}
          {isEditing ? "Editando" : "Nuevo Reporte"}
        </button>
        <button
          className={`tab-btn ${activeTab === "historial" ? "active" : ""}`}
          onClick={() => { setActiveTab("historial"); fetchIncidencias(); }}
        >
          <ClipboardList size={18} /> Ver Historial
        </button>
        <button
          className={`tab-btn ${activeTab === "administracion" ? "active" : ""}`}
          onClick={() => { setActiveTab("administracion"); fetchScanStructure(selectedAdminYear); fetchAdminProperties(); }}
        >
          <Wrench size={18} /> Administración
        </button>
        <button
          className={`tab-btn ${activeTab === "ayuda" ? "active" : ""}`}
          onClick={() => setActiveTab("ayuda")}
        >
          <HelpCircle size={18} /> Ayuda
        </button>
      </nav>

      {/* ── CONTENIDO DINÁMICO ─────────────────────── */}
      <AnimatePresence mode="wait">

        {/* ── TAB: NUEVO REPORTE ── */}
        {activeTab === "nuevo" && (
          <motion.div
            key="form"
            className="glass-card form-card"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <div className="form-section-title">
              {isEditing ? <Pencil size={20} className="icon-accent" /> : <PlusCircle size={20} className="icon-accent" />}
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span>{isEditing ? "Modificando Incidencia Existente" : "Registrar Nueva Incidencia"}</span>
                {!isEditing && (
                  <span className="ref-counter-badge">
                    Próxima Ref: <strong>{nextRef}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* ── SECCIÓN DE SUBIDA DE FACTURA (también al editar) ── */}
            <div className="upload-zone animate-fade-in">
              <div className="upload-header">
                <Truck size={18} />
                <span>Carga de Factura (Auto-Ref)</span>
              </div>
              <div className="upload-content">
                <div className="field-group">
                  <label htmlFor="nombreFactura">
                    <FileText size={14} /> Nombre de la factura
                  </label>
                  <input id="nombreFactura" name="nombreFactura" type="text"
                    value={form.nombreFactura} onChange={handleChange}
                    placeholder="Ej. Fontanería baño principal" />
                </div>
                <label htmlFor="invoice-upload" className={`upload-label ${isUploading ? 'uploading' : ''}`}
                  style={bloqueoSubida && !isUploading ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
                  {isUploading ? <Loader2 size={24} className="spin" /> : <PlusCircle size={24} />}
                  <div className="upload-text">
                    <p>{isUploading ? "Procesando..." : bloqueoSubida || "Haz clic o arrastra la factura"}</p>
                    <small>Se asignará la referencia {nextRef} automáticamente</small>
                    {form.idFactura && <small className="invoice-id-mini">ID: {form.idFactura}</small>}
                  </div>
                  <input
                    id="invoice-upload"
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleFileUpload}
                    disabled={isUploading || !!bloqueoSubida}
                    style={{ display: 'none' }}
                  />
                </label>
                {uploadStatus && (
                  <div className={`upload-status-mini ${uploadStatus.type}`}>
                    {uploadStatus.msg}
                  </div>
                )}
              </div>

              {/* ── VISTA PREVIA ── */}
              {previewUrl && (
                <div className="preview-container animate-fade-in">
                  <div className="preview-header">
                    <span>Vista Previa del Documento</span>
                    <button type="button" onClick={() => { setPreviewUrl(null); setPreviewType(null); }} className="close-preview">
                      ✕
                    </button>
                  </div>
                  {previewType && previewType.startsWith('image/') ? (
                    <img src={previewUrl} alt="Vista previa de factura" className="preview-media" />
                  ) : (
                    <iframe src={previewUrl} title="Vista previa PDF" className="preview-media pdf-preview" />
                  )}
                </div>
              )}
            </div>

            {/* Factura ya guardada en Drive (edición o ref seleccionada) */}
            {(form.ref || form.nombreFactura || form.idFactura) && !previewUrl && (
              <FacturaPreview
                key={form.idFactura || form.nombreFactura || form.ref}
                refNum={form.ref}
                fecha={form.fecha}
                idFactura={form.idFactura}
                nombreFactura={form.nombreFactura}
                propiedad={form.propiedad}
                mes={selectedMonth}
                anio={selectedYear}
              />
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="responsable">
                    <User size={14} /> Responsable <span className="req">*</span>
                  </label>
                  <input id="responsable" name="responsable" type="text"
                    value={form.responsable} onChange={handleChange} required />
                </div>
                <div className="field-group">
                  <label htmlFor="fecha">
                    <Calendar size={14} /> Fecha <span className="req">*</span>
                  </label>
                  <input id="fecha" name="fecha" type="date"
                    value={form.fecha} onChange={handleChange} required />
                </div>
              </div>

              <div className="form-grid">
                <div className="field-group ref-period-group">
                  <label>
                    <ClipboardList size={14} /> Ref. (Nº) — Buscar por periodo
                  </label>

                  {/* Selector de mes / año */}
                  <div className="period-picker">
                    <div className="select-wrap">
                      <select
                        id="refMonth"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                      >
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <ChevronDown size={16} className="select-arrow" />
                    </div>
                    <div className="select-wrap">
                      <select
                        id="refYear"
                        value={selectedYear}
                        onChange={e => setSelectedYear(e.target.value)}
                      >
                        {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2, currentYear + 3].map(y => (
                          <option key={y} value={y.toString()}>{y}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="select-arrow" />
                    </div>
                    {loadingRefs && <Loader2 size={16} className="spin" style={{ color: 'var(--primary)' }} />}
                  </div>

                  {/* Desplegable de referencias — muestra el nombre original del archivo */}
                  <div className="select-wrap">
                    <select
                      id="ref"
                      name="ref"
                      value={form.ref}
                      onChange={e => {
                        const val = e.target.value;
                        const found = existingRefs.find(r => (r.fileId || r.ref) === val || r.ref === val);
                        setForm(prev => ({
                          ...prev,
                          ref: found?.ref && found.ref !== "---" ? found.ref : (val !== "---" ? val : prev.ref),
                          nombreFactura: found ? (found.clientName || found.fullName) : prev.nombreFactura,
                          idFactura: prev.idFactura
                        }));
                        setSelectedRefFileName(found ? found.fullName : "");
                      }}
                    >
                      <option value="">— Seleccionar referencia o archivo —</option>
                      {nextRef !== "..." && (
                        <option value={nextRef}>⭐ Nueva: {nextRef} (siguiente disponible)</option>
                      )}
                      {refsPropiedad.length > 0 && (
                        <optgroup label={`── ${form.propiedad || "Todas"} · ${selectedMonth} ${selectedYear} en Drive (${refsPropiedad.length}) ──`}>
                          {refsPropiedad.map(item => (
                            <option key={item.fileId || item.ref} value={item.fileId || item.ref}>
                              {item.fullName} {item.ref && item.ref !== "---" ? `(Ref ${item.ref})` : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {!loadingRefs && refsPropiedad.length === 0 && (
                        <option disabled>Sin archivos en este periodo</option>
                      )}
                    </select>
                    <ChevronDown size={18} className="select-arrow" />
                  </div>
                  {selectedRefFileName && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                      📄 Archivo: <strong>{selectedRefFileName}</strong>
                    </p>
                  )}
                </div>
                <div className="field-group">
                  <label htmlFor="propiedad">
                    <Home size={14} /> Propiedad <span className="req">*</span>
                  </label>
                  <div className="searchable-select-container">
                    <div className="search-input-wrap">
                      <Search size={16} className="search-icon-inner" />
                      <input
                        type="text"
                        className="prop-search-input"
                        placeholder="Buscar por REF o Nombre..."
                        value={showPropDropdown ? searchPropiedad : (form.propiedad || "")}
                        onFocus={() => { setShowPropDropdown(true); setSearchPropiedad(""); fetchAdminProperties(); }}
                        onChange={(e) => setSearchPropiedad(e.target.value)}
                        onBlur={() => setTimeout(() => setShowPropDropdown(false), 200)}
                      />
                      <ChevronDown size={18} className={`select-arrow ${showPropDropdown ? 'up' : ''}`} />
                    </div>

                    <AnimatePresence>
                      {showPropDropdown && (
                        <motion.div
                          className="search-results-dropdown"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                        >
                          {loadingPropiedades || loadingAdminProps ? (
                            <div className="dropdown-item disabled">Cargando propiedades...</div>
                          ) : (() => {
                            const options = new Map(adminProperties.all.map(name => [name.toUpperCase(), { name, ref: '', encargado: '' }]));
                            propiedadesLocales.forEach(p => options.set(p.name.toUpperCase(), p));
                            const filtered = [...options.values()].filter(p => {
                              const search = searchPropiedad.toLowerCase();
                              const name = (p.name || "").toLowerCase();
                              const ref = (p.ref || "").toLowerCase();
                              const encargado = (p.encargado || "").toLowerCase();

                              return name.includes(search) || ref.includes(search) || encargado.includes(search);
                            });

                            if (filtered.length === 0) {
                              return <div className="dropdown-item disabled">No se encontraron resultados</div>;
                            }

                            return filtered.map((p, i) => (
                              <div
                                key={i}
                                className={`dropdown-item ${form.propiedad === p.name ? 'selected' : ''}`}
                                onClick={() => {
                                  setForm(prev => ({ ...prev, propiedad: p.name }));
                                  setSearchPropiedad(p.name);
                                  setShowPropDropdown(false);
                                }}
                              >
                                <div className="prop-item-main">
                                  <span className="prop-ref">[{p.ref || '—'}]</span>
                                  <span className="prop-name">{p.name}</span>
                                </div>
                                {p.encargado && (
                                  <div className="prop-item-meta">
                                    <span className="prop-encargado">👤 {p.encargado}</span>
                                  </div>
                                )}
                              </div>
                            ));
                          })()}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className="field-group full-width">
                <label htmlFor="clasificacion">
                  <ClipboardList size={14} /> Clasificación <span className="req">*</span>
                </label>
                <div className="select-wrap">
                  <select id="clasificacion" name="clasificacion"
                    value={form.clasificacion} onChange={handleChange} required
                  >
                    <option value="" disabled>— Selecciona —</option>
                    {CLASIFICACIONES.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                  <ChevronDown size={18} className="select-arrow" />
                </div>

                <AnimatePresence>
                  {form.clasificacion === "OTRO" && (
                    <motion.div className="otro-wrap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                      <input id="clasificacionOtro" name="clasificacionOtro" type="text"
                        value={form.clasificacionOtro} onChange={handleChange} autoFocus />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="field-group full-width">
                <label htmlFor="descripcion">
                  <MessageSquare size={14} /> Descripción <span className="req">*</span>
                </label>
                <textarea id="descripcion" name="descripcion" rows={4}
                  value={form.descripcion} onChange={handleChange} required />
              </div>

              <div className="section-divider">
                <Wrench size={16} className="icon-accent" />
                <span>Gestión y Resolución <small>(Opcional)</small></span>
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="operario">
                    <User size={14} /> Operario
                  </label>
                  <input id="operario" name="operario" type="text"
                    value={form.operario} onChange={handleChange} />
                </div>
                <div className="field-group">
                  <label htmlFor="proveedor">
                    <Truck size={14} /> Proveedor
                  </label>
                  <input id="proveedor" name="proveedor" type="text"
                    value={form.proveedor} onChange={handleChange} />
                </div>
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="costoManoObra">
                    <DollarSign size={14} /> Mano de Obra (€)
                  </label>
                  <input id="costoManoObra" name="costoManoObra" type="number"
                    step="0.01" value={form.costoManoObra} onChange={handleChange} />
                </div>
                <div className="field-group">
                  <label htmlFor="estado">
                    <CheckCircle size={14} /> Estado
                  </label>
                  <div className="select-wrap">
                    <select id="estado" name="estado" value={form.estado} onChange={handleChange}>
                      {ESTADOS_INICIALES.map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                    <ChevronDown size={18} className="select-arrow" />
                  </div>
                </div>
              </div>

              <div className="field-group full-width">
                <label htmlFor="accionTomada">
                  <ClipboardList size={14} /> Acción tomada
                </label>
                <textarea id="accionTomada" name="accionTomada" rows={2}
                  value={form.accionTomada} onChange={handleChange} />
              </div>

              <div className="field-group full-width">
                <label htmlFor="planAccion">
                  <Wrench size={14} /> Plan de acción futuro
                </label>
                <textarea id="planAccion" name="planAccion" rows={3}
                  value={form.planAccion} onChange={handleChange} />
              </div>

              {status.msg && <div className={`status-msg ${status.type}`}>{status.msg}</div>}

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  <Eraser size={18} /> Cancelar / Limpiar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <Loader2 size={18} className="spin" /> : <><Send size={18} /> {isEditing ? "Guardar Cambios" : "Enviar Incidencia"}</>}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* ── TAB: HISTORIAL ── */}
        {activeTab === "historial" && (
          <motion.div key="history" className="history-list" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>

            {/* ── BARRA DE BÚSQUEDA ── */}
            <div className="glass-card history-filter-card animate-fade-in">
              <div className="search-box">
                <Search size={20} className="search-icon" />
                <input
                  type="text"
                  placeholder="Buscar por alojamiento..."
                  value={filterPropiedad}
                  onChange={(e) => {
                    setFilterPropiedad(e.target.value);
                    setCurrentPage(1); // Reset a página 1 al filtrar
                  }}
                />
              </div>
              <div className="select-wrap">
                <select
                  value={filterMonth}
                  onChange={(e) => {
                    setFilterMonth(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">Todos los meses</option>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown size={16} className="select-arrow" />
              </div>
            </div>

            <button type="button" className="btn btn-secondary" onClick={() => fetchIncidencias(true)} disabled={loadingHistory}>
              {loadingHistory ? "Actualizando..." : "Actualizar historial"}
            </button>
            {historyError && (
              <div className="glass-card" role="alert">
                <p>{historyError}</p>
                <button type="button" className="btn btn-secondary" onClick={() => fetchIncidencias(true)} disabled={loadingHistory}>Reintentar</button>
              </div>
            )}
            {loadingHistory && incidencias.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '4rem' }}>
                <Loader2 size={40} className="spin icon-accent" />
                <p>Cargando historial...</p>
              </div>
            ) : (() => {
              // Filtrado
              const filtered = incidencias.filter(inc => {
                const searchLower = filterPropiedad.toLowerCase();
                const matchesPropiedad = String(inc["PROPIEDAD"] || "").toLowerCase().includes(searchLower);
                // Buscamos por la referencia (usando la clave 'ref' que viene del Excel)
                const matchesRef = refDeIncidencia(inc).toLowerCase().includes(searchLower);
                const matchesSearch = matchesPropiedad || matchesRef;

                const matchesMonth = (() => {
                  if (!filterMonth) return true;
                  const d = new Date(inc["FECHA"] || inc["FECHA REPORTE INCIDENCIA"]);
                  return !isNaN(d.getTime()) && MONTHS[d.getMonth()] === filterMonth;
                })();

                return matchesSearch && matchesMonth;
              });

              // Paginación
              const totalPages = Math.ceil(filtered.length / itemsPerPage);
              const paginatedData = filtered.slice(
                (currentPage - 1) * itemsPerPage,
                currentPage * itemsPerPage
              );

              if (filtered.length === 0) {
                if (historyError && incidencias.length === 0) return null;
                return (
                  <div className="glass-card" style={{ textAlign: 'center', padding: '4rem' }}>
                    <AlertCircle size={40} className="icon-accent" style={{ opacity: 0.5 }} />
                    <p>{filterPropiedad ? "No se encontraron resultados para esta búsqueda." : "No hay registros."}</p>
                  </div>
                );
              }

              return (
                <>
                  {paginatedData.map((inc, i) => (
                    <div key={inc.rowIndex || i} className="glass-card history-card animate-fade-in">
                      <div className="card-header">
                        <div className="card-title-wrap">
                          <h3>{inc["PROPIEDAD"] || "Sin Nombre"}</h3>
                          <p className="card-date">{formatearFecha(inc["FECHA"] || inc["FECHA REPORTE INCIDENCIA"])}</p>
                        </div>
                        <div className="card-actions-history">
                          {(refDeIncidencia(inc) || inc["ID FACTURA"]) && (
                            <button className="btn btn-secondary btn-icon-only" title="Ver factura"
                              onClick={() => setPreviewRow(prev => prev === inc.rowIndex ? null : inc.rowIndex)}>
                              <Eye size={16} />
                            </button>
                          )}
                          <button className="btn btn-secondary btn-icon-only" title="Editar" disabled={loadingHistory}
                            onClick={() => handleEdit(inc)}>
                            <Pencil size={16} />
                          </button>
                          <button className="btn btn-danger btn-icon-only" title="Borrar" disabled={loadingHistory}
                            onClick={() => handleDelete(inc)}>
                            <Trash2 size={16} />
                          </button>
                          <span className={`badge-status ${String(inc["ESTADO"] || "pendiente").toLowerCase()}`}>
                            {inc["ESTADO"] || "PENDIENTE"}
                          </span>
                        </div>
                      </div>

                      <div className="card-grid">
                        <div className="data-item">
                          <span className="data-label">Ref. Factura</span>
                          <span className="data-value">{refDeIncidencia(inc) || "—"}</span>
                        </div>
                        {(inc["NOMBRE FACTURA"] || inc["ID FACTURA"]) && (
                          <div className="data-item">
                            <span className="data-label">Factura</span>
                            <span className="data-value">{inc["NOMBRE FACTURA"] || "—"}</span>
                            <span className="invoice-id-mini">{inc["ID FACTURA"]}</span>
                          </div>
                        )}
                        <div className="data-item">
                          <span className="data-label">Responsable</span>
                          <span className="data-value">{inc["RESPONSABLE DEL REPORTE"]}</span>
                        </div>
                        <div className="data-item">
                          <span className="data-label">Categoría</span>
                          <span className="data-value">{inc["CLASIFICACION DE LA INCIDENCIA"]}</span>
                        </div>
                        <div className="data-item full-width-item">
                          <span className="data-label">Descripción</span>
                          <div className="description-box">{inc["DESCRIPCION DE LA INCIDENCIA"]}</div>
                        </div>
                        {inc["PLAN DE ACCION"] && (
                          <div className="data-item full-width-item">
                            <span className="data-label">Plan de Acción (Próximos pasos)</span>
                            <span className="data-value" style={{ color: '#ff4d4d' }}>{inc["PLAN DE ACCION"]}</span>
                          </div>
                        )}
                      </div>

                      {previewRow === inc.rowIndex && (
                        <FacturaPreview
                          refNum={refDeIncidencia(inc)}
                          fecha={inc["FECHA"] || inc["FECHA REPORTE INCIDENCIA"]}
                          idFactura={inc["ID FACTURA"]}
                          nombreFactura={inc["NOMBRE FACTURA"]}
                          propiedad={inc["PROPIEDAD"]}
                          mes={(() => {
                            const d = new Date(inc["FECHA"] || inc["FECHA REPORTE INCIDENCIA"]);
                            return !isNaN(d.getTime()) ? MONTHS[d.getMonth()] : undefined;
                          })()}
                          anio={(() => {
                            const d = new Date(inc["FECHA"] || inc["FECHA REPORTE INCIDENCIA"]);
                            return !isNaN(d.getTime()) ? String(d.getFullYear()) : undefined;
                          })()}
                        />
                      )}
                    </div>
                  ))}

                  {/* ── PAGINACIÓN ── */}
                  {totalPages > 1 && (
                    <div className="pagination-wrap animate-fade-in">
                      <button
                        className="pagination-btn"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => prev - 1)}
                      >
                        <ChevronLeft size={20} />
                      </button>

                      <div className="pagination-info">
                        Página <strong>{currentPage}</strong> de {totalPages}
                      </div>

                      <button
                        className="pagination-btn"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </motion.div>
        )}

        {/* ── TAB: ADMINISTRACIÓN ── */}
        {activeTab === "administracion" && (
          <motion.div key="admin" className="glass-card form-card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="form-section-title"><Wrench size={20} className="icon-accent" /><span>Administración de Drive</span></div>
            <p>Prepara las carpetas del año y gestiona los alojamientos disponibles.</p>
            <div className="admin-toolbar">
              <label htmlFor="admin-year">Año</label>
              <select id="admin-year" value={selectedAdminYear} disabled={adminBusy} onChange={e => {
                const year = e.target.value;
                setSelectedAdminYear(year);
                setCreateResult(null);
                setPropFoldersResult(null);
                fetchScanStructure(year, true);
              }} style={{ width: 'auto' }}>
                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2, currentYear + 3].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button className="btn btn-secondary" onClick={() => fetchScanStructure(selectedAdminYear, true)} disabled={loadingAdmin || adminBusy}>
                {loadingAdmin ? <Loader2 size={16} className="spin" /> : <Wrench size={16} />} Escanear Drive
              </button>
            </div>
            {loadingAdmin && <p role="status">Consultando las carpetas de {selectedAdminYear}...</p>}
            {adminError && <div className="status-msg error" role="alert">{adminError} Usa "Escanear Drive" para reintentar.</div>}
            {adminScan && (
              <section aria-label="Carpetas trimestrales">
                <h3 className="admin-section-title">Trimestres de {adminScan.year}</h3>
                <p>Elige un color en los trimestres que quieras preparar o actualizar. Las carpetas existentes se reutilizan.</p>
                <div className="admin-quarter-grid">
                  {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => {
                    // Igual que al subir facturas: la carpeta con el año manda; si no hay, la genérica sin año.
                    const conAnio = adminScan.structure[q].filter(f => f.matchesYear);
                    const folders = conAnio.length ? conAnio : adminScan.structure[q].filter(f => f.isGeneric);
                    return <div className="admin-quarter" key={q}>
                      <h4>{['Enero – Marzo', 'Abril – Junio', 'Julio – Septiembre', 'Octubre – Diciembre'][i]}</h4>
                      {folders.length ? folders.map(f => <p key={f.id}><a href={`https://drive.google.com/drive/folders/${encodeURIComponent(f.id)}`} target="_blank" rel="noreferrer">Abrir carpeta</a> · {f.colorLabel}</p>) : <p>Pendiente de crear</p>}
                      <label htmlFor={`color-${q}`}>Color del trimestre {i + 1}</label>
                      <select id={`color-${q}`} value={colorAssignments[q] || ''} disabled={adminBusy} onChange={e => {
                        const value = e.target.value;
                        setColorAssignments(prev => { const next = { ...prev }; if (value) next[q] = value; else delete next[q]; return next; });
                      }}>
                        <option value="">No modificar</option>
                        {adminScan.colorPalette.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>;
                  })}
                </div>
                <button className="btn btn-primary" onClick={handleCreateStructure} disabled={adminBusy || !Object.keys(colorAssignments).length}>
                  {creatingStructure && <Loader2 size={16} className="spin" />} Preparar trimestres seleccionados
                </button>
              </section>
            )}
            {createResult && <p className={`status-msg ${createResult.success ? 'success' : 'error'}`} role={createResult.success ? 'status' : 'alert'}>{createResult.msg}</p>}

            <section className="help-section" aria-label="Propiedades de Administración">
              <h3><Home size={16} /> Propiedades</h3>
              <p>{adminProperties.lodgify.length} de Lodgify · {adminProperties.manual.length} manuales · {adminProperties.all.length} en total.</p>
              <button className="btn btn-secondary" onClick={() => fetchAdminProperties(true)} disabled={loadingAdminProps || adminBusy}>
                {loadingAdminProps ? 'Cargando propiedades...' : 'Actualizar propiedades'}
              </button>
              {adminPropsError && <p className="status-msg error" role="alert">{adminPropsError} Pulsa "Actualizar propiedades" para reintentar.</p>}
              <label htmlFor="manual-property">Añadir un alojamiento que no está en Lodgify</label>
              <div className="admin-toolbar">
                <input id="manual-property" type="text" placeholder="Nombre del alojamiento" value={newPropertyName} disabled={adminBusy}
                  onChange={e => setNewPropertyName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddProperty(); } }} style={{ flex: 1, minWidth: 0 }} />
                <button className="btn btn-secondary" onClick={handleAddProperty} disabled={adminBusy || loadingAdminProps || !newPropertyName.trim()}>
                  {addingProperty && <Loader2 size={16} className="spin" />} Añadir propiedad
                </button>
              </div>
              {propertyResult && <p className={`status-msg ${propertyResult.success ? 'success' : 'error'}`} role={propertyResult.success ? 'status' : 'alert'}>{propertyResult.msg}</p>}
              {adminProperties.manual.length > 0 && <p>Manuales: {adminProperties.manual.join(', ')}</p>}
            </section>
            <section className="help-section" aria-label="Carpetas espejo">
              <h3><FolderPlus size={16} /> Carpetas por propiedad</h3>
              <p>Prepara la copia espejo: Propiedad / {selectedAdminYear} / Trimestre. Puede tardar varios minutos; las carpetas existentes se conservan.</p>
              <button className="btn btn-secondary" onClick={handleCreatePropertyFolders} disabled={adminBusy || loadingAdminProps || !!adminPropsError || !adminProperties.all.length}>
                {creatingPropFolders && <Loader2 size={16} className="spin" />} Crear carpetas de propiedades ({adminProperties.all.length})
              </button>
              {propFoldersResult && <p className={`status-msg ${propFoldersResult.success ? 'success' : 'error'}`} role={propFoldersResult.success ? 'status' : 'alert'}>{propFoldersResult.msg}</p>}
            </section>
          </motion.div>
        )}

        {/* ── TAB: AYUDA ── */}
        {activeTab === "ayuda" && (
          <motion.div key="ayuda" className="glass-card form-card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="form-section-title">
              <HelpCircle size={20} className="icon-accent" />
              <span>Manual de uso</span>
            </div>

            <div className="help-section">
              <h3><CheckCircle size={16} /> Resumen rápido (el orden importa)</h3>
              <ol>
                <li>Elige el <strong>mes y año</strong> de la factura en "Ref. (Nº) — Buscar por periodo".</li>
                <li>Elige la <strong>Propiedad</strong> (campo con buscador, más abajo en el formulario).</li>
                <li>Escribe el <strong>Nombre de la factura</strong> (arriba, en "Carga de Factura").</li>
                <li>Sube el archivo en "Haz clic o arrastra la factura". Espera al mensaje verde ✅.</li>
                <li>Rellena el resto (Responsable, Fecha, Clasificación, Descripción…) y pulsa <strong>"Enviar Incidencia"</strong>.</li>
              </ol>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Si no hay factura, sáltate los pasos 1 a 4: basta con el formulario y "Enviar Incidencia".
              </p>
            </div>

            <div className="help-section">
              <h3><PlusCircle size={16} /> Nuevo Reporte: el formulario</h3>
              <ol>
                <li><strong>Obligatorios (*):</strong> Responsable (quién reporta), Fecha (cuándo pasó la incidencia), Propiedad, Clasificación y Descripción. Si falta alguno, no se envía.</li>
                <li><strong>Propiedad:</strong> haz clic y escribe parte del nombre, el código (p. ej. 026) o el encargado; elige de la lista. Salen las de Lodgify más las añadidas a mano en Administración. Si no aparece, pide que la añadan (ver Administración).</li>
                <li><strong>Clasificación "OTRO":</strong> aparece una casilla para escribir el tipo.</li>
                <li><strong>Gestión y Resolución (opcional):</strong> Operario, Proveedor, Mano de Obra (€), Estado, Acción tomada y Plan de acción futuro. Se pueden rellenar ahora o más tarde editando la incidencia.</li>
                <li><strong>"Cancelar / Limpiar"</strong> vacía todo el formulario (no borra nada ya guardado ni facturas ya subidas).</li>
                <li>La factura y la incidencia se guardan <strong>por separado</strong>: si subes la factura pero no pulsas "Enviar Incidencia", el archivo queda en Drive pero la incidencia no aparece en el Historial.</li>
              </ol>
            </div>

            <div className="help-section">
              <h3><Truck size={16} /> Subir una factura</h3>
              <ol>
                <li><strong>Mes y año:</strong> son los del periodo al que pertenece la factura; deciden en qué carpeta de Drive se guarda. Cámbialos <strong>antes</strong> de subir.</li>
                <li><strong>Nombre de la factura:</strong> ponle un nombre claro que luego sepas buscar, p. ej. "Tapa WC Vistamar IV" o "Mando garaje Acapulco". Ese nombre es el que tendrá el archivo en Drive y el que verás en el desplegable de referencias. Evita nombres genéricos como "prueba" o "factura".</li>
                <li>El archivo se guarda en Drive así: <code>Nombre FAC-XXXX-XXXX 019.pdf</code> — tu nombre, un código único (ID) y la referencia (REF) del mes. No hace falta renombrar nada.</li>
                <li><strong>REF:</strong> se asigna sola ("Se asignará la referencia 019 automáticamente"). Es un número correlativo por mes, compartido entre todas las propiedades.</li>
                <li>Formatos: PDF o imagen (JPG, PNG). Mientras sube verás "Procesando..."; no cierres la página hasta ver el mensaje verde "✅ Factura subida".</li>
                <li><strong>Una factura por incidencia.</strong> Si necesitas otra, crea otra incidencia.</li>
              </ol>
            </div>

            <div className="help-section">
              <h3><ClipboardList size={16} /> Usar una factura que ya está en Drive</h3>
              <ol>
                <li>Si la factura ya se subió (por ejemplo, desde otra incidencia), no la subas de nuevo: elige mes/año y propiedad, y ábrela en el desplegable <strong>"— Seleccionar referencia o archivo —"</strong>.</li>
                <li>El desplegable solo enseña las facturas de la <strong>propiedad elegida</strong> en ese mes. Si no eliges propiedad, enseña las de todas.</li>
                <li>"⭐ Nueva: 019 (siguiente disponible)" es la próxima referencia libre; úsala solo si vas a subir una factura nueva.</li>
                <li>Debajo aparece "📄 Archivo: …" con el nombre del archivo elegido, para que confirmes que es el correcto.</li>
              </ol>
            </div>

            <div className="help-section">
              <h3><ClipboardList size={16} /> Ver Historial</h3>
              <ol>
                <li>Busca por nombre de alojamiento en "Buscar por alojamiento...".</li>
                <li>Filtra por mes con el desplegable de al lado. El filtro usa la <strong>fecha de la incidencia</strong>, no el mes en que se subió la factura: una incidencia de junio con factura de septiembre sale en junio.</li>
                <li><Eye size={14} /> <strong>Ver factura</strong> abre la vista previa. Solo aparece si la incidencia tiene REF o ID de factura. Si no la encuentra en el mes de la incidencia, la busca sola en el resto de meses del año (por eso el selector "Mes" de la vista previa puede cambiar solo).</li>
                <li><Pencil size={14} /> <strong>Editar</strong> abre la incidencia en el formulario; cambia lo necesario y pulsa "Guardar Cambios".</li>
                <li><Trash2 size={14} /> <strong>Borrar</strong> pide confirmación y elimina la fila del historial. <strong>No borra la factura de Drive</strong>; si también sobra, bórrala a mano en Drive.</li>
                <li>El historial se reutiliza durante un minuto. "Actualizar historial" vuelve a consultarlo; si falla, pulsa "Reintentar". Lo que se cambia desde la app se ve al momento; lo que se cambia <strong>a mano en la hoja de cálculo</strong> puede tardar hasta 5 minutos en verse.</li>
              </ol>
            </div>

            <div className="help-section">
              <h3><Wrench size={16} /> Administración</h3>
              <ol>
                <li><strong>Elige el año:</strong> sus carpetas se consultan automáticamente. Cambiar de año limpia la selección anterior. Al volver a la pestaña se reutiliza la consulta durante un minuto; "Escanear Drive" fuerza una nueva consulta.</li>
                <li><strong>Prepara los trimestres:</strong> cada tarjeta muestra si existe la carpeta y permite abrirla en Drive. Elige un color en los trimestres necesarios y pulsa "Preparar trimestres seleccionados". "No modificar" deja ese trimestre como está.</li>
                <li>La estructura principal es <code>Trimestre y año / INCIDENCIAS</code>. Las subcarpetas de propiedad y mes se crean al subir cada factura. Preparar de nuevo un trimestre reutiliza su carpeta y cambia el color; no mueve ni borra facturas.</li>
                <li><strong>Propiedades:</strong> "Actualizar propiedades" recarga Lodgify y las añadidas a mano. Si aparece un error, resuélvelo y reintenta antes de crear carpetas para todos los alojamientos.</li>
                <li><strong>Añadir propiedad:</strong> escribe el nombre y pulsa el botón o Enter. Espera la confirmación; aparecerá en Nuevo Reporte. Si ya existe en la lista manual, no se duplica. El buscador combina estos nombres con los alojamientos de la hoja, conservando sus referencias y encargados.</li>
                <li><strong>Crear carpetas de propiedades:</strong> prepara la copia espejo en <code>Facturas-Incidencias / Propiedad / Año / Trimestre</code> para la lista cargada. Puede tardar varios minutos y no reemplaza la preparación de los trimestres principales.</li>
                <li><strong>Confirmaciones:</strong> el éxito se muestra cuando el servidor confirma el resultado. Si se agota la espera, actualiza y comprueba Drive antes de repetir: la operación puede haber continuado. Si la carpeta se creó pero el color falló, el mensaje lo indicará.</li>
                <li><strong>Cada enero:</strong> crea en Google Sheets la pestaña "INCIDENCIA &lt;año nuevo&gt;" con las mismas columnas y prepara aquí los trimestres de ese año.</li>
              </ol>
            </div>

            <div className="help-section">
              <h3><FileText size={16} /> Dónde se guarda cada cosa</h3>
              <ol>
                <li><strong>Incidencias:</strong> hoja de cálculo "PAGO A PROPIETARIOS NUEVO", pestaña "INCIDENCIA {new Date().getFullYear()}" (una fila por incidencia).</li>
                <li><strong>Facturas:</strong> en Drive, <code>PERIODO &lt;TRIMESTRE&gt; &lt;AÑO&gt; / INCIDENCIAS / &lt;PROPIEDAD&gt; / &lt;MES&gt;</code>. Ej.: PERIODO JULIO-AGOSTO-SEPTIEMBRE {new Date().getFullYear()} / INCIDENCIAS / APARTAMENTO OROPESA VISTAMAR IV / SEPTIEMBRE.</li>
                <li><strong>Copia espejo:</strong> cada factura se copia también en <code>Facturas-Incidencias / &lt;Propiedad&gt; / &lt;Año&gt; / &lt;Trimestre&gt;</code>. Si borras una factura a mano, bórrala en los dos sitios.</li>
              </ol>
            </div>

            <div className="help-section">
              <h3><HelpCircle size={16} /> Problemas frecuentes</h3>
              <ol>
                <li><strong>"Esperando la referencia de Drive..."</strong> — la app aún está pidiendo el número de REF. Espera unos segundos. Si no cambia, recarga la página.</li>
                <li><strong>"Primero elige la propiedad."</strong> — baja al campo Propiedad del formulario y elige una; después vuelve a la zona de la factura.</li>
                <li><strong>"Escribe el nombre de la factura antes de subirla."</strong> — rellena "Nombre de la factura".</li>
                <li><strong>"Ya existe una factura "…" para … en …"</strong> — esa propiedad ya tiene en ese mes una factura con el mismo nombre. Si es la misma, no la subas: elígela en el desplegable de referencias. Si es otra distinta, cámbiale el nombre (p. ej. añade "2").</li>
                <li><strong>"Esta incidencia ya tiene una factura subida."</strong> — solo se permite una factura por incidencia. Pulsa "Cancelar / Limpiar" y empieza otra incidencia si hace falta.</li>
                <li><strong>"⚠️ Drive no confirma la factura …"</strong> — la subida no se pudo comprobar. Revisa en Administración → "Escanear Drive" que exista la carpeta del trimestre para ese año. Si existe, espera un minuto, recarga la página y mira en el desplegable de referencias si la factura aparece antes de volver a subirla (para no duplicarla).</li>
                <li><strong>No sale el botón "Ver factura" en el Historial</strong> — esa incidencia no tiene REF ni ID de factura guardados. Edítala y elige la factura en el desplegable de referencias.</li>
                <li><strong>La vista previa muestra otra factura o ninguna</strong> — comprueba que la incidencia tiene la propiedad y la REF correctas (Editar). La búsqueda usa ID, nombre, propiedad y REF.</li>
                <li><strong>Guardar tarda</strong> — es normal que "Enviar Incidencia" tarde algunos segundos: la hoja de cálculo es grande. No pulses el botón dos veces.</li>
                <li><strong>El historial sale vacío o con error</strong> — pulsa "Reintentar" o "Actualizar historial". Si sigue igual, comunica el mensaje de error al responsable técnico.</li>
              </ol>
            </div>

            <div className="help-section">
              <h3><FileText size={16} /> Enlaces</h3>
              <ol>
                <li>
                  Hoja de cálculo "PAGO A PROPIETARIOS NUEVO", pestaña "INCIDENCIA {new Date().getFullYear()}" (donde vive el historial):{" "}
                  <a href="https://docs.google.com/spreadsheets/d/1joSFjd6yZS9rjVwbXzuZSU1SVCScbEIVovSexqrO7ZE/edit" target="_blank" rel="noreferrer">
                    abrir en Google Sheets
                  </a>
                </li>
              </ol>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
