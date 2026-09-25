import { useParams, useNavigate, Link } from "react-router-dom";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import OnboardingWizard from "./OnboardingWizard";
import { useOnboarding, calculateCurrentStep } from "./useOnboarding";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";

const OnboardingWizardPage = () => {
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: creators = [] } = useOnboarding();

  const isEditing = !!id;
  const creator = isEditing ? creators.find((c) => c.id === id) : null;
  const initialStep = creator ? calculateCurrentStep(creator) : undefined;

  const handleCancel = () => navigate("/creadores/onboarding");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 bg-background/30 backdrop-blur-xl px-6 pt-4 pb-2 border-b border-white/10">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/creadores">{t("nav.creators")}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/creadores/onboarding">{t("nav.creators.onboarding")}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      {isEditing ? (creator?.name || t("common.edit")) : t("creadores.onb.new")}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="flex items-center gap-3 mt-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel} aria-label={t("common.back")} title={t("common.back")}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <PageHeader title={isEditing ? t("creadores.onb.continue") : t("creadores.onb.new")} />
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
