import { useParams, useNavigate, Link } from "react-router-dom";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import OnboardingWizard from "./OnboardingWizard";
import { useOnboarding, calculateCurrentStep } from "./useOnboarding";

const OnboardingWizardPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: creators = [] } = useOnboarding();

  const isEditing = !!id;
  const creator = isEditing ? creators.find((c) => c.id === id) : null;
  const initialStep = creator ? calculateCurrentStep(creator) : undefined;

  const handleCancel = () => navigate("/creadores/onboarding");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 bg-background/60 backdrop-blur-xl px-6 pt-4 pb-2 border-b border-white/10">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/creadores">Creadores</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/creadores/onboarding">Onboarding</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      {isEditing ? (creator?.name || "Editar") : "Nuevo Onboarding"}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="flex items-center gap-3 mt-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-xl font-semibold">
                  {isEditing ? "Continuar Onboarding" : "Nuevo Onboarding"}
                </h1>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-6 py-6">
              <OnboardingWizard
                onCancel={handleCancel}
                initialStep={initialStep}
                editCreatorId={id}
              />
            </div>
          </div>
  );
};

export default OnboardingWizardPage;
