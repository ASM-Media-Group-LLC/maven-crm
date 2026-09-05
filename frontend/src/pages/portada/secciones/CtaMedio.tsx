// Franja corta de CTA a mitad de la página. Entre el hero y el formulario
// del final había nueve mil píxeles sin un solo botón: quien se convenció en
// Cowork tenía que seguir bajando o volver a la barra.
export default function CtaMedio() {
  return (
    <section className="cta-medio" aria-label="Pedir una demo">
      <div className="wrap">
        <div>
          <div className="eyebrow">Sin compromiso</div>
          <h3>¿Quieres verlo con tu propia operación?</h3>
          <p>
            Te mostramos qué se reemplaza con qué, sobre datos de prueba. Te
            contestamos por correo, sin llamadas que no pediste.
          </p>
        </div>
        <div className="acciones">
          <a className="btn btn-primario btn-lg" href="#demo">Pedir una demo</a>
          <a className="btn btn-fantasma btn-lg" href="#modulos">Ver los módulos</a>
        </div>
      </div>
    </section>
  );
}
