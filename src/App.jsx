// Deployment commit: desplegado
import React, { useState, useEffect } from 'react';
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

  // Selector Mensual de Facturas Drive
  const [monthFiles, setMonthFiles] = useState([]);
  const [loadingMonthFiles, setLoadingMonthFiles] = useState(false);
  const [selectedAdminMonth, setSelectedAdminMonth] = useState(MONTHS[new Date().getMonth()]);

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

  useEffect(() => {
    if (activeTab === "historial") fetchIncidencias();
    if (activeTab === "nuevo") fetchNextRef(selectedMonth, selectedYear);
    if (activeTab === "administracion") { fetchScanStructure(selectedAdminYear); fetchAdminProperties(); }
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

  const fetchScanStructure = async (year) => {
    setLoadingAdmin(true);
    setAdminError(null);
    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=scanStructure&year=${year}`);
      const data = await res.json();
      if (data && data.error) {
        setAdminError(data.error);
        setAdminScan(null);
      } else if (data && data.structure && data.availability && data.colorPalette) {
        setAdminScan(data);
        setColorAssignments({});
      } else {
        // Respuesta inesperada — mostramos error amigable
        setAdminError('Respuesta inesperada de Drive. Verifica permisos y estructura de carpetas.');
        setAdminScan(null);
      }
    } catch (err) {
      console.error('Error escaneo Drive:', err);
      setAdminError('Error de conexión con Drive: ' + err.message);
      setAdminScan(null);
    } finally {
      setLoadingAdmin(false);
    }
  };

  const fetchMonthFiles = async (month, year) => {
    setLoadingMonthFiles(true);
    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getMonthFiles&month=${month}&year=${year}`);
      const data = await res.json();
      setMonthFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
      console.error('Error al obtener archivos del mes:', err);
    } finally {
      setLoadingMonthFiles(false);
    }
  };

  const handleCreateStructure = async () => {
    if (Object.keys(colorAssignments).length === 0) return;
    setCreatingStructure(true);
    setCreateResult(null);
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ action: 'createYearStructure', year: selectedAdminYear, colorAssignments })
      });
      setCreateResult({ success: true, msg: `✅ Estructura ${selectedAdminYear} creada en Drive (con subcarpetas de meses).` });
      setTimeout(() => fetchScanStructure(selectedAdminYear), 2500);
    } catch (err) {
      setCreateResult({ success: false, msg: '❌ Error: ' + err.message });
    } finally {
      setCreatingStructure(false);
    }
  };

  const [ensuringMonths, setEnsuringMonths] = useState(false);
  const [ensureResult, setEnsureResult] = useState(null);

  const handleEnsureMonths = async () => {
    setEnsuringMonths(true);
    setEnsureResult(null);
    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=ensureMonths&year=${selectedAdminYear}`);
      const data = await res.json();
      if (data.success) {
        const summary = data.results.map(r => `${r.quarter}: ${r.status}`).join(' | ');
        setEnsureResult({ success: true, msg: `✅ Meses verificados: ${summary}` });
      } else {
        setEnsureResult({ success: false, msg: '⚠️ ' + JSON.stringify(data) });
      }
    } catch (err) {
      setEnsureResult({ success: false, msg: '❌ Error: ' + err.message });
    } finally {
      setEnsuringMonths(false);
    }
  };

  // Propiedades para creación de carpetas: Lodgify (fuente real) + añadidas a mano
  const [adminProperties, setAdminProperties] = useState({ all: [], lodgify: [], manual: [] });
  const [loadingAdminProps, setLoadingAdminProps] = useState(false);
  const [adminPropsError, setAdminPropsError] = useState(null);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [addingProperty, setAddingProperty] = useState(false);

  const fetchAdminProperties = async () => {
    setLoadingAdminProps(true);
    setAdminPropsError(null);
    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getProperties`);
      const data = await res.json();
      setAdminProperties({ all: data.all || [], lodgify: data.lodgify || [], manual: data.manual || [] });
      if (data.error) setAdminPropsError(data.error);
    } catch (err) {
      setAdminPropsError('Error de conexión con Lodgify: ' + err.message);
    } finally {
      setLoadingAdminProps(false);
    }
  };

  const handleAddProperty = async () => {
    const name = newPropertyName.trim();
    if (!name) return;
    setAddingProperty(true);
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ action: 'addManualProperty', name })
      });
      setNewPropertyName("");
      await fetchAdminProperties();
    } catch (err) {
      setAdminPropsError('Error al añadir propiedad: ' + err.message);
    } finally {
      setAddingProperty(false);
    }
  };

  const [creatingPropFolders, setCreatingPropFolders] = useState(false);
  const [propFoldersResult, setPropFoldersResult] = useState(null);

  const handleCreatePropertyFolders = async () => {
    if (adminProperties.all.length === 0) return;
    setCreatingPropFolders(true);
    setPropFoldersResult(null);
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
          action: 'createPropertyFolders',
          year: selectedAdminYear,
          propiedades: adminProperties.all
        })
      });
      setPropFoldersResult({ success: true, msg: `✅ Carpetas creadas en Facturas-Incidencias para ${adminProperties.all.length} propiedades (${selectedAdminYear}).` });
    } catch (err) {
      setPropFoldersResult({ success: false, msg: '❌ Error: ' + err.message });
    } finally {
      setCreatingPropFolders(false);
    }
  };

  const fetchIncidencias = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=read`);
      const data = await response.json();
      if (Array.isArray(data)) {
        const sortedData = data.sort((a, b) => {
          const dateA = new Date(a["FECHA"] || a["FECHA REPORTE INCIDENCIA"]);
          const dateB = new Date(b["FECHA"] || b["FECHA REPORTE INCIDENCIA"]);
          return dateB - dateA;
        });
        setIncidencias(sortedData);
      }
    } catch (error) {
      console.error("Error al cargar historial:", error);
    } finally {
      setLoadingHistory(false);
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

      // Actualizar localmente eliminando el elemento
      setIncidencias(prev => prev.filter(item => item.rowIndex !== inc.rowIndex));
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

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!form.propiedad) {
      setUploadStatus({ type: 'error', msg: 'Selecciona antes la propiedad: la factura se guarda en su subcarpeta.' });
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
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const finalFileName = `${baseName} ${currentNextRef}.${ext}`;

      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const base64 = event.target.result;
          const payload = {
            action: "uploadInvoice",
            fileBase64: base64,
            fileName: file.name,
            invoiceId: idFactura,
            invoiceName: form.nombreFactura.trim(),
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
          onClick={() => setActiveTab("historial")}
        >
          <ClipboardList size={18} /> Ver Historial
        </button>
        <button
          className={`tab-btn ${activeTab === "administracion" ? "active" : ""}`}
          onClick={() => setActiveTab("administracion")}
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
                <label htmlFor="invoice-upload" className={`upload-label ${isUploading ? 'uploading' : ''}`}>
                  {isUploading ? <Loader2 size={24} className="spin" /> : <PlusCircle size={24} />}
                  <div className="upload-text">
                    <p>{isUploading ? "Procesando..." : "Haz clic o arrastra la factura"}</p>
                    <small>Se asignará la referencia {nextRef} automáticamente</small>
                    {form.idFactura && <small className="invoice-id-mini">ID: {form.idFactura}</small>}
                  </div>
                  <input
                    id="invoice-upload"
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleFileUpload}
                    disabled={isUploading}
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
                      {existingRefs.length > 0 && (
                        <optgroup label={`── ${selectedMonth} ${selectedYear} en Drive (${existingRefs.length}) ──`}>
                          {existingRefs.map(item => (
                            <option key={item.fileId || item.ref} value={item.fileId || item.ref}>
                              {item.fullName} {item.ref && item.ref !== "---" ? `(Ref ${item.ref})` : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {!loadingRefs && existingRefs.length === 0 && (
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
                        onFocus={() => { setShowPropDropdown(true); setSearchPropiedad(""); }}
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
                          {loadingPropiedades ? (
                            <div className="dropdown-item disabled">Cargando propiedades...</div>
                          ) : (() => {
                            const filtered = propiedadesLocales.filter(p => {
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

            {loadingHistory ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '4rem' }}>
                <Loader2 size={40} className="spin icon-accent" />
                <p>Cargando historial...</p>
              </div>
            ) : (() => {
              // Filtrado
              const filtered = incidencias.filter(inc => {
                const searchLower = filterPropiedad.toLowerCase();
                const matchesPropiedad = (inc["PROPIEDAD"] || "").toLowerCase().includes(searchLower);
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
                          <button className="btn btn-secondary btn-icon-only" title="Editar"
                            onClick={() => handleEdit(inc)}>
                            <Pencil size={16} />
                          </button>
                          <button className="btn btn-danger btn-icon-only" title="Borrar"
                            onClick={() => handleDelete(inc)}>
                            <Trash2 size={16} />
                          </button>
                          <span className={`badge-status ${(inc["ESTADO"] || "pendiente").toLowerCase()}`}>
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

            {/* -- Escaneo de estructura -- */}
            <div className="form-section-title">
              <Wrench size={20} className="icon-accent" />
              <span>Administración de Estructura Drive por Colores</span>
            </div>

            <div className="admin-toolbar">
              <div className="select-wrap" style={{ maxWidth: 140 }}>
                <select value={selectedAdminYear} onChange={e => { setSelectedAdminYear(e.target.value); setAdminScan(null); setMonthFiles([]); }}>
                  {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2, currentYear + 3].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDown size={16} className="select-arrow" />
              </div>
              <button className="btn btn-secondary" onClick={() => fetchScanStructure(selectedAdminYear)} disabled={loadingAdmin}>
                {loadingAdmin ? <Loader2 size={16} className="spin" /> : <Wrench size={16} />}
                Escanear Drive
              </button>
              <button className="btn btn-secondary" onClick={handleCreatePropertyFolders} disabled={creatingPropFolders || loadingAdminProps || adminProperties.all.length === 0}>
                {creatingPropFolders ? <Loader2 size={16} className="spin" /> : <PlusCircle size={16} />}
                Crear carpetas de propiedades ({adminProperties.all.length})
              </button>
              {propFoldersResult && (
                <span className={`upload-status-mini ${propFoldersResult.success ? 'success' : 'error'}`}>{propFoldersResult.msg}</span>
              )}
            </div>

            {/* -- Propiedades: Lodgify + añadidas a mano -- */}
            <div className="admin-toolbar" style={{ marginTop: '0.75rem' }}>
              <input
                type="text"
                placeholder="Propiedad que no está en Lodgify..."
                value={newPropertyName}
                onChange={e => setNewPropertyName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddProperty()}
                style={{ flex: 1, minWidth: 220 }}
              />
              <button className="btn btn-secondary" onClick={handleAddProperty} disabled={addingProperty || !newPropertyName.trim()}>
                {addingProperty ? <Loader2 size={16} className="spin" /> : <PlusCircle size={16} />}
                Añadir propiedad
              </button>
            </div>
            {adminPropsError && (
              <div className="status-msg error" style={{ margin: '0.5rem 0' }}>⚠️ {adminPropsError}</div>
            )}
            {adminProperties.manual.length > 0 && (
              <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                Añadidas a mano ({adminProperties.manual.length}): {adminProperties.manual.join(', ')}
              </p>
            )}

            {/* Error de escaneo */}
            {adminError && (
              <div className="status-msg error" style={{ margin: '1rem 0' }}>
                ⚠️ {adminError}
              </div>
            )}

            {/* Grid de disponibilidad de colores */}
            {adminScan && !adminError && (
              <div className="admin-grid-wrap">
                <h3 className="admin-section-title">Disponibilidad de Colores — {adminScan.year}</h3>
                <div className="color-grid">
                  <div className="color-grid-header">Color</div>
                  {["Q1", "Q2", "Q3", "Q4"].map(q => (
                    <div key={q} className="color-grid-header">{["Ene-Feb-Mar", "Abr-May-Jun", "Jul-Ago-Sep", "Oct-Nov-Dic"][["Q1", "Q2", "Q3", "Q4"].indexOf(q)]}</div>
                  ))}
                  {adminScan.colorPalette.map(color => (
                    <React.Fragment key={color.id}>
                      <div className="color-cell color-label-cell">
                        <span className="color-dot" style={{ background: color.hex }}></span>
                        {color.label}
                      </div>
                      {["Q1", "Q2", "Q3", "Q4"].map(q => {
                        const used = adminScan.availability[q].used.includes(color.id);
                        const folderInfo = adminScan.structure[q].find(f => f.matchesYear && f.color === color.id);
                        return (
                          <div key={q} className={`color-cell ${used ? 'cell-used' : 'cell-free'}`}>
                            {used ? (
                              <span title={folderInfo?.name || 'Ocupado'}>✓ Ocupado</span>
                            ) : (
                              <>
                                <span>— Libre</span>
                                <input
                                  type="checkbox"
                                  className="cell-checkbox"
                                  checked={colorAssignments[q] === color.id}
                                  onChange={e => setColorAssignments(prev => e.target.checked ? { ...prev, [q]: color.id } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== q || prev[k] !== color.id)))}
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>

                {Object.keys(colorAssignments).length > 0 && (
                  <div className="admin-create-bar">
                    <p>Crear carpetas seleccionadas para <strong>{selectedAdminYear}</strong>:</p>
                    {["Q1", "Q2", "Q3", "Q4"].filter(q => colorAssignments[q]).map(q => (
                      <span key={q} className="create-badge">
                        <span className="color-dot" style={{ background: adminScan.colorPalette.find(c => c.id === colorAssignments[q])?.hex }}></span>
                        {["Q1 → Ene-Mar", "Q2 → Abr-Jun", "Q3 → Jul-Sep", "Q4 → Oct-Dic"][["Q1", "Q2", "Q3", "Q4"].indexOf(q)]}
                      </span>
                    ))}
                    <button className="btn btn-primary" onClick={handleCreateStructure} disabled={creatingStructure}>
                      {creatingStructure ? <Loader2 size={16} className="spin" /> : <PlusCircle size={16} />}
                      Crear Estructura en Drive
                    </button>
                    {createResult && (
                      <span className={`upload-status-mini ${createResult.success ? 'success' : 'error'}`}>{createResult.msg}</span>
                    )}
                  </div>
                )}
              </div>
            )}

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
              <h3><PlusCircle size={16} /> Nuevo Reporte</h3>
              <ol>
                <li>Rellena responsable, propiedad, clasificación y descripción (los campos con * son obligatorios).</li>
                <li>Si hay factura de por medio: elige primero la propiedad, luego el mes/año del periodo al que pertenece la factura, y sube el archivo. La referencia (REF) se asigna sola.</li>
                <li>Guarda con "Enviar". La factura y la incidencia se guardan por separado: si subes la factura pero no llegas a guardar el formulario, la incidencia no queda en el historial aunque el archivo ya esté en Drive.</li>
              </ol>
            </div>

            <div className="help-section">
              <h3><ClipboardList size={16} /> Ver Historial</h3>
              <ol>
                <li>Busca por nombre de alojamiento o referencia de factura en la barra de búsqueda.</li>
                <li>Filtra por mes con el desplegable de al lado. El filtro usa la <strong>fecha de la incidencia</strong>, no el mes en que se subió la factura — si registras hoy una incidencia de hace meses, aparecerá en el mes de esa fecha, no en el mes actual.</li>
                <li>El icono del ojo abre la vista previa de la factura. Si no la encuentra en el mes de la incidencia, busca sola en el resto de meses del año antes de darla por no encontrada.</li>
                <li>Lápiz edita, papelera borra (pide confirmación).</li>
              </ol>
            </div>

            <div className="help-section">
              <h3><Wrench size={16} /> Administración</h3>
              <ol>
                <li>"Escanear Drive" muestra qué colores de carpeta están libres/ocupados por trimestre para el año elegido.</li>
                <li>"Crear carpetas de propiedades" prepara en Drive la estructura Propiedad / Año / Trimestre para todas las propiedades activas.</li>
                <li>Puedes añadir a mano una propiedad que no esté en Lodgify.</li>
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
